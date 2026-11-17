#!/usr/bin/env node
/**
 * session-status plugin: PostInvocation hook
 *
 * Reads the transcript JSONL to find the last turn's token counts
 * and any background tasks, then injects a compact Status Bar Capsule
 * visible to the user.
 */

const fs = require('fs');
const readline = require('readline');

async function readInput() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => raw += chunk);
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { resolve({}); }
    });
  });
}

async function parseTranscript(transcriptPath) {
  const result = {
    lastInputTokens: 0,
    lastOutputTokens: 0,
    lastCacheTokens: 0,
    daemonTasks: [],
  };

  if (!transcriptPath || !fs.existsSync(transcriptPath)) return result;

  const fileStream = fs.createReadStream(transcriptPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const steps = [];
  for await (const line of rl) {
    const l = line.trim();
    if (!l) continue;
    try { steps.push(JSON.parse(l)); } catch { /* skip malformed */ }
  }

  // Find the last PLANNER_RESPONSE with tokens (= last model call, best proxy for context size)
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.source === 'MODEL' && s.type === 'PLANNER_RESPONSE' && (s.input_tokens || s.cache_read_tokens)) {
      result.lastInputTokens = s.input_tokens || 0;
      result.lastOutputTokens = s.output_tokens || 0;
      result.lastCacheTokens = s.cache_read_tokens || 0;
      break;
    }
  }

  // Collect daemon/background tasks from run_command calls with IsDaemon=true
  // that haven't been explicitly finished
  const daemonSet = new Map(); // commandId -> summary
  for (const s of steps) {
    const calls = s.tool_calls || [];
    for (const tc of calls) {
      if (tc.name === 'run_command') {
        const args = tc.args || {};
        const isDaemon = String(args.IsDaemon || '').toLowerCase() === 'true';
        if (isDaemon) {
          const summary = args.toolSummary || (String(args.CommandLine || '').substring(0, 50));
          daemonSet.set(tc.id || summary, summary);
        }
      }
      // manage_task kill removes a task
      if (tc.name === 'manage_task') {
        const args = tc.args || {};
        if (args.Action === 'kill' && args.TaskId) {
          daemonSet.delete(args.TaskId);
        }
      }
    }
  }

  // Also look at the most recent manage_task list output for authoritative task list
  let latestTaskListContent = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    const content = s.content || '';
    if (s.type === 'GENERIC' && /active task|no task|running task/i.test(content)) {
      latestTaskListContent = content;
      break;
    }
  }

  if (latestTaskListContent) {
    // Parse "X active task(s): [{...}]" JSON embedded in content
    const jsonMatch = latestTaskListContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      try {
        const tasks = JSON.parse(jsonMatch[0]);
        result.daemonTasks = tasks
          .filter(t => t.state === 'running' || t.state === 'working')
          .map(t => `${t.role || t.TypeName || 'Task'} (${t.TaskId || ''})`);
      } catch { /* ignore */ }
    }
  }

  // Fallback to inferred daemon set
  if (result.daemonTasks.length === 0 && daemonSet.size > 0) {
    result.daemonTasks = Array.from(daemonSet.values()).slice(0, 5);
  }

  return result;
}

function contextStatus(tokens) {
  if (tokens < 50000)  return { emoji: '🟢', label: 'An toàn' };
  if (tokens < 100000) return { emoji: '🟡', label: 'Trung bình' };
  if (tokens < 150000) return { emoji: '🟠', label: 'Cao (/compact)' };
  return { emoji: '🔴', label: 'Nguy hiểm (New Chat)' };
}

function fmt(n) {
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return n.toLocaleString('en-US');
}

function makeProgressBar(pct) {
  const totalBars = 10;
  const filled = Math.min(totalBars, Math.max(0, Math.round((pct / 100) * totalBars)));
  const empty = totalBars - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function buildFooter({ lastInputTokens, lastOutputTokens, lastCacheTokens, daemonTasks, fullyIdle }) {
  const ctxTokens = lastInputTokens;
  const { emoji, label } = contextStatus(ctxTokens);
  const MAX_CONTEXT = 200000;
  const pct = Math.min(100, Math.round((ctxTokens / MAX_CONTEXT) * 1000) / 10);
  const bar = makeProgressBar(pct);

  const taskStr = daemonTasks.length > 0
    ? `⚙️ Tasks: \`${daemonTasks.length} running\``
    : `⚙️ Tasks: \`0\` ✅`;

  return [
    '---',
    `> ${emoji} **Session Status** \`[${bar}] ${pct}%\` (${label})  `,
    `> 🧠 Context: **${fmt(ctxTokens)}** · 💾 Cache: **${fmt(lastCacheTokens)}** · 📤 Out: **${fmt(lastOutputTokens)}** · ${taskStr}`
  ].join('\n');
}

async function main() {
  const data = await readInput();

  const fullyIdle = data.fullyIdle !== false;
  const transcriptPath = data.transcriptPath || '';
  const tokenData = await parseTranscript(transcriptPath);

  const footerMd = buildFooter({ ...tokenData, fullyIdle });

  // Output userMessage for direct visibility in chat + systemMessage user_markdown for compatibility
  const output = {
    injectSteps: [
      {
        userMessage: footerMd,
      },
    ],
  };

  process.stdout.write(JSON.stringify(output));
}

main().catch(err => {
  // On error, silently output empty (don't block agent)
  process.stderr.write(String(err));
  process.stdout.write(JSON.stringify({}));
});
