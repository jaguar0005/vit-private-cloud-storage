import net from 'node:net';
import fs from 'node:fs';
import config from '../config/index.js';

export interface ScanResult {
  isInfected: boolean;
  virusName?: string;
  scannerUsed: 'ClamAV-Daemon' | 'Fallback-Signature-Engine';
}

export class ScannerService {
  /**
   * Scans a file on disk for viruses and malware.
   * Uses ClamAV daemon if available; falls back to embedded signature scanner (with full EICAR detection) for local evaluation.
   */
  public static async scanFile(filePath: string): Promise<ScanResult> {
    const isClamAvOnline = await this.pingClamAV();

    if (isClamAvOnline) {
      try {
        return await this.scanWithClamAvDaemon(filePath);
      } catch (err) {
        console.warn('ClamAV daemon scan error, falling back to signature engine:', err);
      }
    }

    // Fallback Signature Engine (active in standalone development & evaluation)
    return await this.scanWithFallbackEngine(filePath);
  }

  /**
   * Pings ClamAV daemon TCP port
   */
  public static pingClamAV(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(800);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        resolve(false);
      });
      socket.connect(config.CLAMAV_PORT, config.CLAMAV_HOST);
    });
  }

  /**
   * Streams a file to ClamAV daemon via INSTREAM protocol
   */
  private static async scanWithClamAvDaemon(filePath: string): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let response = '';

      socket.connect(config.CLAMAV_PORT, config.CLAMAV_HOST, () => {
        // ClamAV INSTREAM protocol command
        socket.write('zINSTREAM\0');

        const readStream = fs.createReadStream(filePath);

        readStream.on('data', (chunk: Buffer | string) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const lengthBuffer = Buffer.alloc(4);
          lengthBuffer.writeUInt32BE(buf.length, 0);
          socket.write(lengthBuffer);
          socket.write(buf);
        });

        readStream.on('end', () => {
          // Zero-length chunk indicates EOF
          const zeroBuffer = Buffer.alloc(4);
          zeroBuffer.writeUInt32BE(0, 0);
          socket.write(zeroBuffer);
        });

        readStream.on('error', (err) => reject(err));
      });

      socket.on('data', (data) => {
        response += data.toString();
      });

      socket.on('end', () => {
        const trimmed = response.trim();
        if (trimmed.includes('FOUND')) {
          const match = trimmed.match(/stream:\s+(.+)\s+FOUND/);
          resolve({
            isInfected: true,
            virusName: match ? match[1] : 'Malware-Detected',
            scannerUsed: 'ClamAV-Daemon',
          });
        } else {
          resolve({
            isInfected: false,
            scannerUsed: 'ClamAV-Daemon',
          });
        }
      });

      socket.on('error', (err) => reject(err));
    });
  }

  /**
   * Embedded fallback signature scanner that detects the official EICAR test string
   * and suspicious executable/script markers in untrusted uploads.
   */
  private static async scanWithFallbackEngine(filePath: string): Promise<ScanResult> {
    const buffer = await fs.promises.readFile(filePath);
    const content = buffer.toString('utf-8');

    // 1. Detect standard EICAR test file string
    if (content.includes(config.EICAR_SIGNATURE) || buffer.includes(Buffer.from(config.EICAR_SIGNATURE))) {
      return {
        isInfected: true,
        virusName: 'EICAR-Test-Signature (Standard Antivirus Test File)',
        scannerUsed: 'Fallback-Signature-Engine',
      };
    }

    // 2. Detect common webshell and malicious binary injection markers
    const malwarePatterns = [
      /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR/i,
      /<\?php\s+(eval|system|exec|passthru|shell_exec)/i,
      /<script\b[^>]*>[\s\S]*?(document\.cookie|eval\()/i,
    ];

    for (const pattern of malwarePatterns) {
      if (pattern.test(content)) {
        return {
          isInfected: true,
          virusName: 'Malicious-Payload-Signature',
          scannerUsed: 'Fallback-Signature-Engine',
        };
      }
    }

    return {
      isInfected: false,
      scannerUsed: 'Fallback-Signature-Engine',
    };
  }
}

export default ScannerService;
