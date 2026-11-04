/**
 * 给 dist/main.js 加可执行位。
 *
 * Windows 没有 POSIX 权限位，`chmod +x` 在 cmd 里既不存在也会让构建脚本以
 * 非零码退出（产物其实是好的）。所以这里跨平台处理：非 Windows 才 chmod。
 */
import fs from 'node:fs';
import path from 'node:path';

const target = path.join(process.cwd(), 'dist', 'main.js');

if (process.platform === 'win32') {
  process.exit(0);
}

try {
  fs.chmodSync(target, 0o755);
} catch (error) {
  if (error && error.code === 'ENOENT') {
    console.warn(`skip chmod: ${target} not found`);
    process.exit(0);
  }
  throw error;
}
