// ============================================================================
// Crux-Webmail — BullMQ Mock para Testing
// ============================================================================

export class MockJob {
  id: string;
  name: string;
  data: any;
  timestamp: number;
  attemptsMade: number;

  constructor(name: string, data: any) {
    this.id = crypto.randomUUID();
    this.name = name;
    this.data = data;
    this.timestamp = Date.now();
    this.attemptsMade = 0;
  }
}

let jobs: MockJob[] = [];
let queues: Map<string, MockJob[]> = new Map();

export const BullMQMock = {
  init(): void {
    jobs = [];
    queues = new Map();
  },

  getJobs(): MockJob[] {
    return [...jobs];
  },

  getQueueJobs(name: string): MockJob[] {
    return queues.get(name) || [];
  },

  clearAll(): void {
    jobs = [];
    queues = new Map();
  },
};

export const mockAddJob = jest.fn(async (queueName: string, name: string, data: any): Promise<MockJob> => {
  const job = new MockJob(name, data);
  jobs.push(job);
  if (!queues.has(queueName)) queues.set(queueName, []);
  queues.get(queueName)!.push(job);
  return job;
});

export const mockGetQueueStats = jest.fn(async (queueName: string): Promise<Record<string, unknown>> => {
  const qJobs = queues.get(queueName) || [];
  return {
    waiting: qJobs.filter(j => j.attemptsMade === 0).length,
    active: 0,
    completed: 0,
    failed: 0,
    paused: false,
  };
});

export const mockQueueIsPaused = jest.fn(async (): Promise<boolean> => false);
export const mockQueuePause = jest.fn(async (): Promise<void> => {});
export const mockQueueResume = jest.fn(async (): Promise<void> => {});