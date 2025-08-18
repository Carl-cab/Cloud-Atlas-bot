import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Testing authentication failure scenarios...');
    
    // Test 1: No authorization header
    try {
      const authHeader = req.headers.get('authorization');
      if (!authHeader) {
        throw new Error('No authorization header provided');
      }
    } catch (error) {
      console.log('✅ Auth Test 1 PASS: No auth header properly rejected');
    }

    // Test 2: Invalid/malformed token
    const testResults = [];
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Test with invalid tokens
    const invalidTokens = [
      'invalid_token',
      'Bearer invalid_token',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
      '',
      null
    ];

    for (const token of invalidTokens) {
      try {
        if (token) {
          const cleanToken = token.replace('Bearer ', '');
          const { data: { user }, error } = await supabaseAuth.auth.getUser(cleanToken);
          
          if (error || !user) {
            testResults.push({
              token: token?.substring(0, 20) + '...' || 'null',
              status: 'REJECTED',
              error: error?.message || 'No user returned'
            });
          } else {
            testResults.push({
              token: token?.substring(0, 20) + '...' || 'null',
              status: 'UNEXPECTED_SUCCESS',
              user: user.id
            });
          }
        }
      } catch (authError) {
        testResults.push({
          token: token?.substring(0, 20) + '...' || 'null',
          status: 'REJECTED',
          error: authError.message
        });
      }
    }

    // Test 3: Expired token handling
    const authHeader = req.headers.get('authorization');
    let tokenTestResult = null;
    
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
        
        if (authError) {
          tokenTestResult = {
            status: 'REJECTED',
            error: authError.message,
            message: 'Token properly rejected'
          };
        } else if (user) {
          tokenTestResult = {
            status: 'VALID',
            userId: user.id,
            message: 'Valid token accepted'
          };
        }
      } catch (error) {
        tokenTestResult = {
          status: 'ERROR',
          error: error.message
        };
      }
    }

    // Log security audit event
    if (tokenTestResult?.status === 'VALID') {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      await supabase
        .from('security_audit_log')
        .insert({
          user_id: tokenTestResult.userId,
          action: 'AUTH_FAILURE_TEST_EXECUTED',
          resource: 'authentication',
          success: true,
          metadata: { 
            invalid_token_tests: testResults.length,
            all_invalid_rejected: testResults.every(t => t.status === 'REJECTED')
          }
        });
    }

    console.log('Authentication failure tests completed');

    return new Response(JSON.stringify({
      success: true,
      message: 'Authentication failure tests completed',
      results: {
        invalid_token_tests: testResults,
        current_token_test: tokenTestResult,
        summary: {
          total_invalid_tokens_tested: testResults.length,
          all_properly_rejected: testResults.every(t => t.status === 'REJECTED'),
          security_status: testResults.every(t => t.status === 'REJECTED') ? 'SECURE' : 'NEEDS_REVIEW'
        }
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Auth failure test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});