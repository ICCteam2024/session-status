#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Log to file for debugging
const logFile = path.join(process.env.PLUGIN_DATA || __dirname, 'hook_debug.log');
const timestamp = new Date().toISOString();

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  
  // Write debug log
  fs.appendFileSync(logFile, `\n[${timestamp}] Hook called\nEvent: ${data.hookEventName || 'unknown'}\nInput keys: ${Object.keys(data).join(', ')}\nTranscriptPath: ${data.transcriptPath || 'NOT PROVIDED'}\n---\n`);
  
  // Output empty valid response (PostInvocation format)
  process.stdout.write(JSON.stringify({ injectSteps: [] }));
});
