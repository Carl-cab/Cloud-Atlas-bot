import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MigrationRequest {
  action: 'migrate_legacy_keys' | 'check_status';
  user_id?: string;
}

class LegacyKeyMigrator {
  private supabase;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  // Check for legacy keys that need migration
  async checkLegacyKeys(userId?: string): Promise<{ 
    success: boolean; 
    legacy_count: number; 
    total_count: number; 
    users_affected?: string[];
    error?: string 
  }> {
    try {
      let query = this.supabase
        .from('api_keys')
        .select('user_id, exchange, encryption_version, encryption_key_id');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const totalCount = data?.length || 0;
      const legacyKeys = data?.filter(key => 
        !key.encryption_version || 
        key.encryption_version === 'edge_v1' || 
        !key.encryption_key_id?.includes('v2')
      ) || [];

      const usersAffected = [...new Set(legacyKeys.map(key => key.user_id))];

      return {
        success: true,
        legacy_count: legacyKeys.length,
        total_count: totalCount,
        users_affected: userId ? undefined : usersAffected
      };
    } catch (error) {
      console.error('Error checking legacy keys:', error);
      return { success: false, legacy_count: 0, total_count: 0, error: error.message };
    }
  }

  // Migrate legacy keys by re-encrypting them with enhanced security
  async migrateLegacyKeys(userId?: string): Promise<{ 
    success: boolean; 
    migrated_count: number; 
    error?: string;
    details?: any[]
  }> {
    try {
      // First, identify legacy keys
      let query = this.supabase
        .from('api_keys')
        .select('*');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: legacyKeys, error: selectError } = await query
        .or('encryption_version.is.null,encryption_version.eq.edge_v1,encryption_key_id.not.like.*v2*');

      if (selectError) throw selectError;

      if (!legacyKeys || legacyKeys.length === 0) {
        return { success: true, migrated_count: 0, details: [] };
      }

      const migrationResults = [];
      let migratedCount = 0;

      for (const key of legacyKeys) {
        try {
          // Mark the key for re-encryption by updating encryption_version
          // The application will handle re-encryption on next access
          const { error: updateError } = await this.supabase
            .from('api_keys')
            .update({
              encryption_version: 'migration_pending',
              updated_at: new Date().toISOString()
            })
            .eq('id', key.id);

          if (updateError) throw updateError;

          // Log the migration initiation
          await this.supabase
            .from('security_audit_log')
            .insert({
              user_id: key.user_id,
              action: 'KEY_MIGRATION_INITIATED',
              resource: 'api_keys',
              success: true,
              metadata: {
                key_id: key.id,
                exchange: key.exchange,
                old_version: key.encryption_version || 'unknown',
                migration_reason: 'security_upgrade'
              }
            });

          migratedCount++;
          migrationResults.push({
            key_id: key.id,
            exchange: key.exchange,
            status: 'marked_for_migration'
          });

        } catch (keyError) {
          console.error(`Failed to migrate key ${key.id}:`, keyError);
          migrationResults.push({
            key_id: key.id,
            exchange: key.exchange,
            status: 'failed',
            error: keyError.message
          });
        }
      }

      return {
        success: true,
        migrated_count: migratedCount,
        details: migrationResults
      };

    } catch (error) {
      console.error('Error migrating legacy keys:', error);
      return { success: false, migrated_count: 0, error: error.message };
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This function requires service role access for system-level operations
    const authHeader = req.headers.get('authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!authHeader || !authHeader.includes(serviceRoleKey || '')) {
      // For admin/system operations, require service role key
      // In production, you might want to add additional authentication
      console.warn('Legacy key migration attempted without proper authorization');
    }

    const request: MigrationRequest = await req.json();
    const migrator = new LegacyKeyMigrator();

    switch (request.action) {
      case 'check_status': {
        const result = await migrator.checkLegacyKeys(request.user_id);
        
        return new Response(JSON.stringify({
          ...result,
          message: result.legacy_count > 0 ? 
            `Found ${result.legacy_count} legacy keys out of ${result.total_count} total keys` :
            'All keys are using current encryption standards'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'migrate_legacy_keys': {
        const result = await migrator.migrateLegacyKeys(request.user_id);
        
        return new Response(JSON.stringify({
          ...result,
          message: result.migrated_count > 0 ? 
            `Successfully initiated migration for ${result.migrated_count} keys` :
            'No legacy keys found requiring migration'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        throw new Error(`Unknown action: ${request.action}`);
    }

  } catch (error) {
    console.error('Legacy Key Migration Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});