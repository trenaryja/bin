#!/usr/bin/env bun
import { runService } from '@/lib'
import { serve } from './server'

await runService(import.meta.path, serve)
