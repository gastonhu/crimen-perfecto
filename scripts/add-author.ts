// Da de alta (o de baja) a un autor del editor: crea la cuenta en Supabase Auth y la suma a cp_authors.
// Uso:
//   npm run add-author -- autor@ejemplo.com            → pide la contraseña (sin mostrarla) y la crea o la cambia
//   npm run add-author -- --remove autor@ejemplo.com   → quita el permiso de autor (la cuenta queda)
// Requiere VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env. Ningún email ni contraseña queda en el repo.
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile?.('.env');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env');

const args = process.argv.slice(2);
const remove = args.includes('--remove');
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Uso: npm run add-author -- autor@ejemplo.com   (o --remove autor@ejemplo.com)');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** Lee una línea de la terminal sin mostrarla (para la contraseña). */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error('Corré el script en una terminal interactiva para escribir la contraseña.'));
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function findUser(target: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === target);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

if (remove) {
  const u = await findUser(email);
  if (!u) {
    console.log(`No hay ninguna cuenta con ${email}.`);
    process.exit(0);
  }
  const { error } = await db.from('cp_authors').delete().eq('user_id', u.id);
  if (error) throw error;
  console.log(`✓ ${email} ya no es autor (la cuenta sigue existiendo).`);
  process.exit(0);
}

const password = await askHidden(`Contraseña para ${email} (mínimo 12 caracteres): `);
if (password.length < 12) {
  console.error('La contraseña tiene que tener al menos 12 caracteres.');
  process.exit(1);
}
if ((await askHidden('Repetila: ')) !== password) {
  console.error('Las contraseñas no coinciden.');
  process.exit(1);
}

let user = await findUser(email);
if (user) {
  const { error } = await db.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) throw error;
  console.log(`La cuenta ya existía: actualicé su contraseña.`);
} else {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  user = data.user;
  console.log('Cuenta creada en Supabase Auth.');
}

const { error } = await db.from('cp_authors').upsert({ user_id: user!.id, email });
if (error) throw error;
console.log(`✓ ${email} es autor. Entrá al editor en el sitio (✎ Crear un caso) con ese email y contraseña.`);
console.log('Recordá desactivar el registro público: Supabase → Authentication → Sign In / Providers → "Allow new users to sign up".');
