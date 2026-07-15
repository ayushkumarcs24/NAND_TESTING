import { supabase } from '../db/supabase';

export async function writeAuditLog(payload: {
  entity_type: string;
  entity_id: string;
  user_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_value: any;
  new_value: any;
}) {
  const { error } = await supabase.from('audit_log').insert({
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    user_id: payload.user_id,
    action: payload.action,
    old_value: payload.old_value,
    new_value: payload.new_value,
  });
  if (error) {
    console.error('Failed to write audit log:', error);
  }
}
