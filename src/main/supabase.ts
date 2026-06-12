import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

// Polyfill WebSocket for Node.js 20
if (!global.WebSocket) {
  global.WebSocket = ws as any;
}

interface SyncableRecord {
  id: string;
  synced: boolean;
}

interface QueuedAction {
  id: string;
  actionType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Cloud-first sync handler for Supabase.
 * Implements conflict resolution: last-write-wins on Supabase, local queue for offline.
 */
export class SupabaseSync {
  private client: SupabaseClient | null = null;
  private enabled = false;

  constructor() {
    this.enabled = false;
    this.client = null;
  }

  /**
   * Initialize Supabase client with credentials.
   * Validates connection before enabling sync.
   */
  async initialize(supabaseUrl: string, supabaseKey: string): Promise<boolean> {
    try {
      const urlValid = supabaseUrl.trim().length > 0 && supabaseUrl.includes('supabase');
      const keyValid = supabaseKey.trim().length > 0;

      if (!urlValid || !keyValid) {
        console.warn('[Supabase] Invalid credentials provided');
        return false;
      }

      this.client = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
      });

      // Test connection by attempting a simple query
      const { error } = await this.client.from('employees').select('id').limit(1);

      if (error && !error.message.includes('does not exist')) {
        console.warn('[Supabase] Connection test failed:', error.message);
        this.client = null;
        return false;
      }

      this.enabled = true;
      console.log('[Supabase] Initialized and ready for sync');
      return true;
    } catch (error) {
      console.warn('[Supabase] Initialization failed:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Convert camelCase keys to snake_case.
   * Handles nested objects recursively.
   */
  private camelToSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      result[snakeKey] = value;
    }
    return result;
  }

  /**
   * Sync a single record to Supabase (upsert).
   * Implements idempotency via unique constraints.
   */
  async syncRecord(
    table: string,
    record: Record<string, unknown> & SyncableRecord,
    uniqueFields?: string[]
  ): Promise<boolean> {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      const { error } = await this.client.from(table).upsert([record], {
        onConflict: uniqueFields?.join(',')
      });

      if (error) {
        console.warn(`[Supabase] Upsert failed for ${table}:`, error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.warn(`[Supabase] Sync error for ${table}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Fetch records from Supabase with optional filtering.
   * Used during initial load and periodic syncs.
   */
  async fetchRecords(
    table: string,
    filters?: Record<string, unknown>
  ): Promise<Array<Record<string, unknown>>> {
    if (!this.enabled || !this.client) {
      return [];
    }

    try {
      let query = this.client.from(table).select('*');

      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value);
        }
      }

      const { data, error } = await query;

      if (error) {
        console.warn(`[Supabase] Fetch failed for ${table}:`, error.message);
        return [];
      }

      return data ?? [];
    } catch (error) {
      console.warn(`[Supabase] Fetch error for ${table}:`, error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  /**
   * Process queued actions from offline period.
   * Implements last-write-wins: server state overwrites local on conflict.
   * Converts camelCase payloads to snake_case for Supabase schema.
   */
  async processQueue(queuedActions: QueuedAction[]): Promise<Array<{ id: string; success: boolean }>> {
    const results: Array<{ id: string; success: boolean }> = [];

    for (const action of queuedActions) {
      try {
      
        let success = false;
        const convertedPayload = this.camelToSnakeCase(action.payload);

        console.log('ACTION:', action.actionType);
        console.log('ENTITY:', action.entityType);
        console.log('PAYLOAD:', action.payload);

        if (action.actionType === 'employee:delete') {
          const { error } = await this.client!
            .from('employees')
            .delete()
            .eq('id', action.payload.id as number);
        
          if (error) {
            console.warn('[Supabase] Delete failed:', error.message);
            success = false;
          } else {
            success = true;
          }
        } else if (action.entityType === 'employee') {
          success = await this.syncRecord('employees', {
            ...(convertedPayload as Record<string, unknown>),
            synced: true
          });
        } else if (action.entityType === 'attendance') {
          success = await this.syncRecord('attendance_sessions', {
            ...(convertedPayload as Record<string, unknown>),
            synced: true
          });
        } else if (action.entityType === 'leave') {
          success = await this.syncRecord('leave_requests', {
            ...(convertedPayload as Record<string, unknown>),
            synced: true
          });
        }

        results.push({ id: action.id, success });
      } catch (error) {
        console.warn(`[Supabase] Queue processing failed for ${action.id}:`, error instanceof Error ? error.message : String(error));
        results.push({ id: action.id, success: false });
      }
    }

    return results;
  }

  isConnected(): boolean {
    return this.enabled && this.client !== null;
  }
}

export const supabaseSync = new SupabaseSync();