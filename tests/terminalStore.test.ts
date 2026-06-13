import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearTerminalLogs,
  getTerminalLogs,
  logToTerminal,
  pushTerminalLog,
  subscribeTerminalLogs,
} from '@/lib/terminal/store';

describe('terminal store', () => {
  beforeEach(() => {
    clearTerminalLogs();
  });

  it('starts empty after clear', () => {
    expect(getTerminalLogs()).toEqual([]);
  });

  it('pushes log entries and assigns unique ids', () => {
    pushTerminalLog({ level: 'info', text: 'a\n', timestamp: 1 });
    pushTerminalLog({ level: 'stdout', text: 'b\n', timestamp: 2 });
    const lines = getTerminalLogs();
    expect(lines).toHaveLength(2);
    expect(lines[0].id).not.toBe(lines[1].id);
    expect(lines[0].text).toBe('a\n');
    expect(lines[1].level).toBe('stdout');
  });

  it('logToTerminal appends newline when missing', () => {
    logToTerminal('hello', 'info');
    const lines = getTerminalLogs();
    expect(lines[0].text).toBe('hello\n');
  });

  it('notifies subscribers on push', () => {
    let received: number = 0;
    const unsub = subscribeTerminalLogs((lines) => {
      received = lines.length;
    });
    pushTerminalLog({ level: 'info', text: 'x', timestamp: 0 });
    expect(received).toBe(1);
    pushTerminalLog({ level: 'info', text: 'y', timestamp: 0 });
    expect(received).toBe(2);
    unsub();
    pushTerminalLog({ level: 'info', text: 'z', timestamp: 0 });
    expect(received).toBe(2); // unsubscribed
  });

  it('subscriber errors do not break other subscribers', () => {
    let goodCalls = 0;
    subscribeTerminalLogs(() => {
      throw new Error('bad subscriber');
    });
    subscribeTerminalLogs(() => {
      goodCalls++;
    });
    pushTerminalLog({ level: 'info', text: '1', timestamp: 0 });
    pushTerminalLog({ level: 'info', text: '2', timestamp: 0 });
    expect(goodCalls).toBe(2);
  });

  it('clearTerminalLogs notifies subscribers with empty array', () => {
    pushTerminalLog({ level: 'info', text: 'x', timestamp: 0 });
    let received: number = -1;
    subscribeTerminalLogs((lines) => {
      received = lines.length;
    });
    clearTerminalLogs();
    expect(received).toBe(0);
    expect(getTerminalLogs()).toEqual([]);
  });
});
