import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { isDocker } from './utils.js';

export class PlatformPathResolver {
  constructor() {}

  async getCommonRoots() {
    if (isDocker()) {
      return await this.discoverDockerMounts();
    }
    return this.getHostCommonRoots();
  }

  async discoverDockerMounts() {
    try {
      const mounts = await fs.readFile('/proc/mounts', 'utf8');
      const lines = mounts.split('\n').filter(Boolean);
      const suggestions = [];
      const ignoreFs = [
        'proc', 'sysfs', 'tmpfs', 'devtmpfs', 'cgroup', 'overlay', 'mqueue',
        'shm', 'devpts', 'cgroup2', 'bpf', 'tracefs', 'debugfs', 'securityfs',
        'pstore', 'hugetlbfs', 'nsfs', 'autofs', 'efivarfs', 'fusectl', 'mqueue', 'squashfs'
      ];
      const ignorePaths = ['/proc', '/sys', '/dev', '/run', '/etc', '/boot', '/var'];

      for (const line of lines) {
        const parts = line.split(' ');
        if (parts.length < 3) continue;
        const mountPoint = parts[1];
        const fsType = parts[2];

        if (ignoreFs.includes(fsType)) continue;
        if (ignorePaths.some(p => mountPoint === p || mountPoint.startsWith(p + '/'))) continue;
        // Also ignore root itself, it's not a specific mount folder
        if (mountPoint === '/') continue;

        if (await this.isValidDirectory(mountPoint)) {
          suggestions.push(mountPoint);
        }
      }
      return suggestions;
    } catch (err) {
      console.warn('Could not read /proc/mounts', err);
      return [];
    }
  }

  async getHostCommonRoots() {
    const home = os.homedir();
    const candidates = [
      path.join(home, 'Projects'),
      path.join(home, 'source', 'repos'),
      path.join(home, 'Documents', 'GitHub'),
      path.join(home, 'Development'),
      path.join(home, 'Code'),
      path.join(home, 'workspace'),
      path.join(home, 'Documents'),
      path.join(home, 'Desktop')
    ];
    
    const valid = [];
    for (const c of candidates) {
      if (await this.isValidDirectory(c)) valid.push(c);
    }
    return valid;
  }

  async isValidDirectory(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) return false;
      await fs.access(dirPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async validateRoot(dirPath) {
    if (isDocker()) {
      if (/^[a-zA-Z]:\\/.test(dirPath) || /^\\\\/.test(dirPath) || /^[a-zA-Z]:\//.test(dirPath)) {
        return { 
          valid: false, 
          error: `The selected path cannot be accessed from inside the Docker container.\n\nThis appears to be a host operating system path.\n\nMount the directory into Docker first and then use the mounted container path instead.\n\nExample:\nHost:\nC:\\Users\\Shravan\\Projects\nDocker:\n/repos`
        };
      }
    }

    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        return { valid: false, error: `'${dirPath}' is not a directory. Verify your configuration.` };
      }
      await fs.access(dirPath, fs.constants.R_OK);
      return { valid: true };
    } catch (err) {
      if (isDocker()) {
        return { valid: false, error: `'${dirPath}' does not exist or is not readable.\n\nVerify your Docker volume mapping before saving this scan root.` };
      } else {
        return { valid: false, error: `'${dirPath}' does not exist or is not readable.` };
      }
    }
  }
}

export const pathResolver = new PlatformPathResolver();
