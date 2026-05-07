// ============================================================================
// Crux-Webmail — Sequelize Mock para Testing
// ============================================================================

export interface MockRecord {
  id: string;
  [key: string]: any;
}

export class ModelMock {
  static records: Map<string, MockRecord[]> = new Map();

  constructor(public data?: Record<string, any>) {}

  static async create(input: Record<string, any>): Promise<any> {
    const modelName = this.name;
    if (!this.records.has(modelName)) {
      this.records.set(modelName, []);
    }
    const record = {
      id: crypto.randomUUID(),
      ...input,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.records.get(modelName)!.push(record);
    return { ...record, update: async (d: any) => this.updateRecord(modelName, record.id, d) };
  }

  static async findByPk(pk: string): Promise<any> {
    const modelName = this.name;
    const records = this.records.get(modelName) || [];
    return records.find(r => r.id === pk) || null;
  }

  static async findOne(opts?: any): Promise<any> {
    const modelName = this.name;
    const records = this.records.get(modelName) || [];
    if (!opts?.where) return records[0] || null;
    return records.filter(r => matchesWhere(r, opts.where))[0] || null;
  }

  static async findAll(opts?: any): Promise<any[]> {
    const modelName = this.name;
    let records = [...(this.records.get(modelName) || [])];
    if (opts?.where) {
      records = records.filter(r => matchesWhere(r, opts.where));
    }
    if (opts?.order) {
      const [field, dir] = opts.order[0];
      records.sort((a, b) => {
        if ((a[field] || '').toString() > (b[field] || '').toString()) return dir === 'DESC' ? -1 : 1;
        return dir === 'DESC' ? 1 : -1;
      });
    }
    if (opts?.limit) records = records.slice(opts.offset || 0, (opts.offset || 0) + opts.limit);
    return records;
  }

  static async destroy(opts?: any): Promise<number> {
    const modelName = this.name;
    const records = this.records.get(modelName) || [];
    if (!opts?.where) return 0;
    const toDelete = records.filter(r => matchesWhere(r, opts.where));
    this.records.set(modelName, records.filter(r => !toDelete.includes(r)));
    return toDelete.length;
  }

  static async count(opts?: any): Promise<number> {
    const modelName = this.name;
    const records = this.records.get(modelName) || [];
    if (!opts?.where) return records.length;
    return records.filter(r => matchesWhere(r, opts.where)).length;
  }

  static async update(values: Record<string, any>, opts?: any): Promise<[number]> {
    const modelName = this.name;
    const records = this.records.get(modelName) || [];
    let updated = 0;
    for (const r of records) {
      if (!opts?.where || matchesWhere(r, opts.where)) {
        Object.assign(r, values, { updated_at: new Date().toISOString() });
        updated++;
      }
    }
    return [updated];
  }

  static async updateRecord(modelName: string, id: string, values: Record<string, any>): Promise<void> {
    const records = this.records.get(modelName) || [];
    const record = records.find(r => r.id === id);
    if (record) {
      Object.assign(record, values, { updated_at: new Date().toISOString() });
    }
  }

  static reset(): void {
    this.records.clear();
  }

  static resetAll(): void {
    this.records.clear();
  }
}

function matchesWhere(record: MockRecord, where: Record<string, any>): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (typeof value === 'object' && value !== null) {
      for (const [op, opVal] of Object.entries(value)) {
        if (op === 'ne') {
          if (record[key] === opVal) return false;
        } else if (op === 'lt') {
          if (!(record[key] < opVal)) return false;
        } else if (op === 'gt') {
          if (!(record[key] > opVal)) return false;
        } else if (op === 'like') {
          if (!record[key]?.toString().includes(opVal)) return false;
        }
      }
    } else {
      if (record[key] !== value) return false;
    }
  }
  return true;
}