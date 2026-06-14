#!/usr/bin/env node

import { spawn } from 'node:child_process';
import http from 'node:http';
import { chromium } from 'playwright';

const PORT = Number(process.env.BROWSER_SMOKE_PORT || 5189);
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const STARTUP_TIMEOUT = 60000;
const CHECK_INTERVAL = 1000;

const PASSED = [];
const FAILED = [];

function log(message) {
  console.log(`[browser-smoke] ${message}`);
}

function logPass(name) {
  PASSED.push(name);
  console.log(`  PASS: ${name}`);
}

function logFail(name, detail = '') {
  FAILED.push({ name, detail });
  console.log(`  FAIL: ${name}${detail ? ` - ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode || 0));
    });
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
  });
}

function startDevServer() {
  const serverProc = spawn(
    'npx',
    ['nuxt', 'dev', '--port', String(PORT), '--host', HOST],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  serverProc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    if (process.env.BROWSER_SMOKE_VERBOSE) process.stdout.write(text);
  });

  serverProc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (process.env.BROWSER_SMOKE_VERBOSE) process.stderr.write(text);
  });

  return serverProc;
}

async function waitForServer(serverProc) {
  const startTime = Date.now();
  let earlyExit = null;

  serverProc.once('exit', (code) => {
    earlyExit = code;
  });

  while (Date.now() - startTime < STARTUP_TIMEOUT) {
    if (earlyExit !== null) {
      throw new Error(`Dev server exited early with code ${earlyExit}`);
    }

    try {
      const status = await httpGet(`${BASE_URL}/`);
      if (status >= 200 && status < 500) return;
    } catch {
      // Keep polling until the startup timeout expires.
    }

    await sleep(CHECK_INTERVAL);
  }

  throw new Error(`Timed out waiting for ${BASE_URL}`);
}

async function runCheck(name, fn) {
  try {
    await fn();
    logPass(name);
  } catch (error) {
    logFail(name, error.message);
  }
}

async function clickNav(page, label, expectedText) {
  const button = page.getByRole('button', { name: label });
  await button.click();
  await page.getByText(expectedText).first().waitFor({ state: 'visible', timeout: 10000 });
}

async function runBrowserChecks() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('zfl-3-spaces', '[]');
    localStorage.removeItem('zfl-3-current-space');
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  try {
    await runCheck('首页可在真实浏览器中打开', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.getByText('露营装备共享社群').first().waitFor({ state: 'visible', timeout: 10000 });
    });

    await runCheck('页面标题正确', async () => {
      const title = await page.title();
      if (title !== '露营装备共享社群') {
        throw new Error(`Unexpected title: ${title}`);
      }
    });

    await runCheck('装备盘点面板可点击渲染', async () => {
      await clickNav(page, '装备盘点', '新建盘点单');
    });

    await runCheck('预约排程面板可点击渲染', async () => {
      await clickNav(page, '预约排程', '提交候补预约');
    });

    await runCheck('费用结算面板可点击渲染', async () => {
      await clickNav(page, '费用结算', '新建结算单');
    });

    await runCheck('数据导入导出面板可点击渲染', async () => {
      await clickNav(page, '数据导入导出', '数据导出');
      await page.getByText('数据导入').first().waitFor({ state: 'visible', timeout: 10000 });
    });

    await runCheck('浏览器控制台无错误', async () => {
      if (consoleErrors.length > 0 || pageErrors.length > 0) {
        throw new Error([...consoleErrors, ...pageErrors].join(' | '));
      }
    });
  } finally {
    await context.close();
    await browser.close();
  }
}

async function stopServer(serverProc) {
  if (!serverProc || serverProc.killed) return;

  serverProc.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => serverProc.once('exit', resolve)),
    sleep(5000).then(() => false)
  ]);

  if (exited === false && !serverProc.killed) {
    serverProc.kill('SIGKILL');
  }
}

async function run() {
  log('='.repeat(60));
  log('Browser Smoke Tests - 真实浏览器冒烟测试开始');
  log('='.repeat(60));

  let serverProc;
  try {
    log(`启动 Nuxt 开发服务器：${BASE_URL}`);
    serverProc = startDevServer();
    await waitForServer(serverProc);
    logPass('服务器就绪');

    await runBrowserChecks();

    log('='.repeat(60));
    log(`测试完成: 通过 ${PASSED.length}, 失败 ${FAILED.length}`);

    if (FAILED.length > 0) {
      log('失败用例详情:');
      FAILED.forEach((failure, index) => {
        console.log(`  ${index + 1}. ${failure.name}${failure.detail ? `: ${failure.detail}` : ''}`);
      });
      process.exitCode = 1;
    }
  } catch (error) {
    logFail('浏览器冒烟测试执行', error.message);
    process.exitCode = 1;
  } finally {
    log('关闭开发服务器...');
    await stopServer(serverProc);
  }

  if (process.exitCode) {
    log('浏览器冒烟测试存在失败');
  } else {
    log('浏览器冒烟测试全部通过');
  }
}

run().catch((error) => {
  console.error('[browser-smoke] Fatal error:', error);
  process.exit(1);
});
