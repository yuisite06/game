import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;

// Cards de reserva (aparecem se o Supabase não estiver configurado ou der erro).
const FALLBACK = {
  'mural-1': { title: 'Mural 1', artist: 'Artista a definir', text: 'Aqui entra o texto do card: trajetória, linguagem artística e a relação do artista com o território.',
    question: 'Pergunta de exemplo: onde nasce a arte periférica?', options: ['Só nos museus', 'No território, na quebrada', 'Só nas galerias'], answer: 1 },
  'mural-2': { title: 'Mural 2', artist: 'Artista a definir', text: 'Segundo card em construção. Pesquise o artista e confirme as informações em fontes confiáveis.',
    question: 'Pergunta de exemplo 2', options: ['Opção A', 'Opção B', 'Opção C'], answer: 0 },
  'mural-3': { title: 'Mural 3', artist: 'Artista a definir', text: 'Terceiro card em construção.',
    question: 'Pergunta de exemplo 3', options: ['Opção A', 'Opção B', 'Opção C'], answer: 2 },
};

export async function loadCard(muralId) {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('cards').select('*').eq('mural_id', muralId).single();
      if (!error && data) return data;
    } catch (_) { /* cai pro fallback */ }
  }
  return FALLBACK[muralId];
}

// Guarda o feedback do formulário de avaliação (opcional, tabela "feedback").
export async function sendFeedback(payload) {
  if (!supabase) return false;
  const { error } = await supabase.from('feedback').insert(payload);
  return !error;
}
