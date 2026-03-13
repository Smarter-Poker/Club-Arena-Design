import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const clubIdStr = '25450';
  const { data: clubData } = await supabase
    .from('clubs')
    .select('id')
    .eq('club_id', Number(clubIdStr))
    .maybeSingle();
  if (!clubData) return console.log('Club not found');
  const resolvedId = clubData.id;

  const { data: ucRow } = await supabase
    .from('union_clubs')
    .select('union_id')
    .eq('club_id', resolvedId)
    .maybeSingle();

  let unionClubIds = [resolvedId];
  if (ucRow) {
    const { data: allUcRows } = await supabase
      .from('union_clubs')
      .select('club_id')
      .eq('union_id', ucRow.union_id);
    if (allUcRows) unionClubIds = allUcRows.map((r) => r.club_id);
  }

  console.log('Union club IDs:', unionClubIds);

  // Try the failing query exactly
  const { count: totalMembers, error: err1 } = await supabase
    .from('club_members')
    .select('*', { count: 'exact', head: true })
    .in('club_id', unionClubIds)
    .in('status', ['active', 'approved']);

  console.log('Total members query result:', { totalMembers, err1 });

  const { count: onlineMembers, error: err2 } = await supabase
    .from('club_members')
    .select('*', { count: 'exact', head: true })
    .in('club_id', unionClubIds)
    .in('status', ['active', 'approved'])
    .eq('is_online', true);

  console.log('Online members query result:', { onlineMembers, err2 });
}
run();
