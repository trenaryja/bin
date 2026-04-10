use serde::Serialize;
use std::io::{self, Write};
use std::path::PathBuf;

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
    let mut max_depth: Option<usize> = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--skip-hidden" => skip_hidden = true,
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

        let size = match entry.metadata() {
            Ok(m) => m.len(),
            Err(e) => {
                eprintln!("dux-scan: {}: {}", entry.path().display(), e);
                continue;
            }
        };
        let is_dir = entry.file_type().is_dir();
        let path = entry.path().to_string_lossy().into_owned();

        let record = Entry { path, size, is_dir };

        let write_result = serde_json::to_writer(&mut out, &record)
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e))
            .and_then(|()| out.write_all(b"\n"));

        if let Err(e) = write_result {
            if e.kind() == io::ErrorKind::BrokenPipe {
                break;
            }
            eprintln!("dux-scan: write error: {}", e);
        }
    }
}
