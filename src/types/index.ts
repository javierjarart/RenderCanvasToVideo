export interface Preset {
  name: string;
  width: number;
  height: number;
  fps: number;
  codec: string;
  container: string;
  pixFmt: string;
  codecParams: Record<string, string>;
}

export interface ColorProfile {
  name: string;
  primaries: string;
  trc: string;
  space: string;
}

export interface RenderParams {
  project: string | null;
  width: number;
  height: number;
  fps: number;
  duration: number;
  bgColor: string;
  customProjectPath: string | null;
  codec: string;
  container: string;
  pixFmt: string;
  codecParams: Record<string, string>;
  crf?: number;
  colorPrimaries?: string;
  colorTrc?: string;
  colorSpace?: string;
  canvasSelector?: string;
}

export interface RenderStatus {
  state: 'idle' | 'rendering' | 'done' | 'error' | 'cancelled';
  progress: number;
  total: number;
  fileUrl: string | null;
  error: string | null;
}

export interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error';
  message: string;
}

export interface LogResponse {
  logs: LogEntry[];
  total: number;
}
