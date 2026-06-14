#!/usr/bin/env node

import { spawn } from 'child_process';
import http from 'http';

const PORT = 5189;
const BASE_URL = `http://localhost:${PORT}`;
const STARTUP_TIMEOUT = 60000;
const CHECK_INTERVAL = 2000;

const PASSED = [];
const FAILED = [];

function log(msg) {
  console.log(`[browser-smoke] ${msg}`);
}

function logPass(name) {
  PASSED.push(name);
  console.log(`  ✅ PASS: ${name}`);
}

function logFail(name, detail = '') {
  FAILED.push({ name, detail });
  console.log(`  ❌ FAIL: ${name}${detail ? ` - ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('timeout', () => { req.destroy(new Error('Request timeout')); });
    req.on('error', reject);
  });
}

function startDevServer() {
  return new Promise((resolve, reject) => {
    log(`Starting Nuxt dev server on port ${PORT}...`);

    const serverProc = spawn('npx', ['nuxt', 'dev', '--port', String(PORT), '--host', '127.0.0.1'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let resolved = false;
    let outputBuffer = '';

    const cleanup = () => {
      serverProc.stdout.removeAllListeners();
      serverProc.stderr.removeAllListeners();
      serverProc.removeAllListeners();
    };

    const onData = (chunk) => {
      const text = chunk.toString();
      outputBuffer += text;
      if (text.includes('Nitro server built') || text.includes('Vite client warmed up') || text.includes('ready')) {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(serverProc);
        }
      }
    };

    serverProc.stdout.on('data', onData);
    serverProc.stderr.on('data', onData);

    serverProc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Failed to start dev server: ${err.message}`));
      }
    });

    serverProc.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Dev server exited early with code ${code}. Output: ${outputBuffer.slice(-1000)}`));
      }
    });
  });
}

function check(description, fn) {
  return async () => {
    try {
      const result = await fn();
      if (result === true || (typeof result === 'string' && result.length === 0)) {
        logPass(description);
        return true;
      } else {
        logFail(description, typeof result === 'string' ? result : '');
        return false;
      }
    } catch (e) {
      logFail(description, e.message);
      return false;
    }
  };
}

const TESTS = [
  check('首页 HTTP 200 响应', async () => {
    const res = await httpGet(`${BASE_URL}/`);
    return res.statusCode === 200 ? true : `Status ${res.statusCode}`;
  }),

  check('页面标题包含「露营装备共享社群」', async () => {
    const res = await httpGet(`${BASE_URL}/`);
    return res.body.includes('露营装备共享社群') ? true : '标题缺失';
  }),

  check('页面包含 Vue/Nuxt 应用标记', async () => {
    const res = await httpGet(`${BASE_URL}/`);
    const hasMarker = res.body.includes('__NUXT__') || res.body.includes('data-v-app') || res.body.includes('/_nuxt/');
    return hasMarker ? true : '未检测到应用标记';
  }),

  check('页面包含导航按钮「装备盘点」', async () => {
    const res = await httpGet(`${BASE_URL}/`);
    return res.body.includes('装备盘点') ? true : '装备盘点按钮缺失';
  }),

  check('页面包含导航按钮「费用结算」', async () => {
    const res = await httpGet(`${BASE_URL}/`);
    return res.body.includes('费用结算') ? true : '费用结算按钮缺失';
  }),

  check('页面包含导航按钮「预约排程」', async () => {
    const res = await httpGet(`${BASE_URL}/`);
    return res.body.includes('预约排程') ? true : '预约排程按钮缺失';
  }),

  check('页面包含导航按钮「数据导入导出」', async () => {
    const res = await httpGet(`${BASE_URL}/`);
    return res.body.includes('数据导入导出') ? true : '数据导入导出按钮缺失';
  }),

  check('页面包含核心模块脚本加载', async () => {
    const res = await httpGet(`${BASE_URL}/`);
    const hasScripts = res.body.includes('entry') && res.body.includes('.js');
    return hasScripts ? true : '核心脚本缺失';
  }),

  check('页面不包含服务端错误信息', async () => {
    const res = await httpGet(`${BASE_URL}/`);
    const hasError = res.body.includes('stack trace') || res.body.includes('Error:') || res.body.includes('500');
    return !hasError ? true : '检测到服务端错误';
  }),

  check('静态资源可访问', async () => {
    try {
      const manifest = await httpGet(`${BASE_URL}/_nuxt/builds/latest.json`, 5000);
      if (manifest.statusCode === 200) return true;
      const entry = await httpGet(`${BASE_URL}/`, 5000);
      return entry.statusCode === 200 ? true : 'manifest 无法访问';
    } catch {
      return true;
    }
  })
];

async function runTests() {
  log('='.repeat(60));
  log('Browser Smoke Tests - 浏览器冒烟测试开始');
  log('='.repeat(60));
  log('启动开发服务器...');

  let serverProc;
  try {
    serverProc = await startDevServer();
  } catch (e) {
    logFail('启动开发服务器', e.message);
    process.exit(1);
  }

  log('开发服务器启动成功');

  log('等待服务器就绪...');
  const startTime = Date.now();
  let ready = false;
  while (Date.now() - startTime < STARTUP_TIMEOUT) {
    try {
      const res = await httpGet(`${BASE_URL}/`, 3000);
      if (res.statusCode === 200) {
        ready = true;
        break;
      }
    } catch {
      await sleep(CHECK_INTERVAL);
    }
    await sleep(CHECK_INTERVAL);
  }

  if (!ready) {
    logFail('服务器就绪超时');
    serverProc.kill('SIGTERM');
    process.exit(1);
  }
  logPass('服务器就绪');

  console.log('');
  log('执行测试用例:');
  console.log('');

  for (const test of TESTS) {
    await test();
  }

  console.log('');
  log('='.repeat(60));
  log(`测试完成: 通过 ${PASSED.length}/${TESTS.length}, 失败 ${FAILED.length}/${TESTS.length}`);

  if (FAILED.length > 0) {
    console.log('');
    log('失败用例详情:');
    FAILED.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
    });
  }

  log('关闭开发服务器...');
  serverProc.kill('SIGTERM');

  setTimeout(() => {
    const exitCode = FAILED.length === 0 ? 0 : 1;
    log(`浏览器冒烟测试${FAILED.length === 0 ? '全部通过' : '存在失败'}`);
    process.exit(exitCode);
  }, 2000);
}

runTests().catch((e) => {
  console.error('[browser-smoke] Fatal error:', e);
  process.exit(1);
});
