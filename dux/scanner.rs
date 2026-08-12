use serde::Serialize;
use std::collections::HashSet;
use std::io::{self, Write};
use std::os::unix::fs::MetadataExt;
use std::path::PathBuf;

/// POSIX reports `st_blocks` in fixed 512-byte units regardless of block size.
const BYTES_PER_BLOCK: u64 = 512;

#[derive(Serialize)]
struct Entry {
    path: String,
    size: u64,
    is_dir: bool,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();

    let mut root = match std::env::current_dir() {
        Ok(cwd) => cwd,
        Err(e) => {
            eprintln!("dux-scan: failed to get working directory: {}", e);
            std::process::exit(1);
        }
    };
    let mut skip_hidden = false;
    let mut apparent_size = false;
    let mut max_depth: Option<usize> = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--skip-hidden" => skip_hidden = true,
            "--apparent-size" => apparent_size = true,
            "--max-depth" => {
                i += 1;
                if i < args.len() {
                    if let Ok(d) = args[i].parse::<usize>() {
                        max_depth = Some(d);
                    } else {
                        eprintln!("dux-scan: invalid --max-depth value: {}", args[i]);
                        std::process::exit(1);
                    }
                }
            }
            other => root = PathBuf::from(other),
        }
        i += 1;
    }

    // Canonicalize to prevent path traversal and resolve symlinks
    let root = match root.canonicalize() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("dux-scan: cannot resolve path {}: {}", root.display(), e);
            std::process::exit(1);
        }
    };

    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());

    // Only multiply-linked files can collide, so the set stays small on normal trees.
    let mut seen_inodes: HashSet<(u64, u64)> = HashSet::new();

    let mut walker = jwalk::WalkDir::new(&root)
        .skip_hidden(skip_hidden)
        .follow_links(false)
        .sort(false);

    if let Some(depth) = max_depth {
        walker = walker.max_depth(depth);
    }

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("dux-scan: {}", e);
                continue;
            }
        };

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(e) => {
                eprintln!("dux-scan: {}: {}", entry.path().display(), e);
                continue;
            }
        };
        let is_dir = entry.file_type().is_dir();

        // A hardlinked file (pnpm/bun content stores, Time Machine) is reachable
        // by many paths but occupies one set of blocks. Charge it to the first
        // path we reach and zero the rest, so totals match `du`.
        let already_counted = !is_dir
            && metadata.nlink() > 1
            && !seen_inodes.insert((metadata.dev(), metadata.ino()));

        let size = if already_counted {
            0
        } else if apparent_size {
            metadata.len()
        } else {
            metadata.blocks() * BYTES_PER_BLOCK
        };

        let path = entry.path().to_string_lossy().into_owned();

        let record = Entry { path, size, is_dir };

        let write_result = serde_json::to_writer(&mut out, &record)
            .map_err(io::Error::other)
            .and_then(|()| out.write_all(b"\n"));

        if let Err(e) = write_result {
            if e.kind() == io::ErrorKind::BrokenPipe {
                break;
            }
            eprintln!("dux-scan: write error: {}", e);
        }
    }
}
