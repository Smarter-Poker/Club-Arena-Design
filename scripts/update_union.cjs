const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'daniel@bekavactrading.com',
    password: 'Bek454545!!'
  });
  if (error) {
    console.error('Login failed:', error.message);
    return;
  }
  const userId = data.user.id;
  console.log('Daniel ID:', userId);

  const { data: unions, error: unErr } = await supabaseAdmin.from('unions').select('*');
  if (unions && unions.length > 0) {
     const targetUnion = unions[0];
     if (targetUnion.owner_id !== userId) {
       console.log('Updating union owner to Daniel...');
       await supabaseAdmin.from('unions').update({ owner_id: userId }).eq('id', targetUnion.id);
       console.log('Update complete.');
     } else {
       console.log('Daniel is already the owner of Union:', targetUnion.name);
     }
  } else {
     console.log('No unions found');
  }
}
run();
