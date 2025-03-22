import { exec } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);
export const MAX_BUFFER_SIZE = 1024 * 1024 * 100; // 100MB buffer size for large log files 