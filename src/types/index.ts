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
  filters?: string;
  hwaccel?: string;
}

export interface JobInfo {
  id: string;
  status: 'queued' | 'rendering' | 'done' | 'error' | 'cancelled';
  progress: number;
  total: number;
  file_url: string | null;
  error: string | null;
  params: RenderParams;
  project_name: string;
  output_filename: string;
  created_at: string;
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
