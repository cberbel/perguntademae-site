// Edge function "perguntademae" — responde as perguntas do site
// Pergunta de Mãe (bebês de 0 a 3 anos), uma realização da Free School.
//
// O PRODUTO É ACOLHIMENTO À MÃE, não conteúdo técnico: o prompt abaixo é a
// peça central do site. Mexer nele muda o produto — leia inteiro antes.
//
// verify_jwt: OFF de propósito — o site é público e sem login.
// PROTEÇÃO DE CUSTO = os limites por IP e global, que se apoiam nas linhas de
// public.perguntademae_perguntas. O CORS NÃO protege o bolso (Origin é forjável fora
// do navegador); ele só protege o usuário no navegador. Por isso os dois
// caminhos de contagem falham FECHADO: se não dá para contar ou para gravar,
// a chamada paga à Anthropic não acontece.
// Segredo reaproveitado do projeto: ANTHROPIC_API_KEY (o mesmo do whatsapp-bot).

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MODELO = "claude-sonnet-5";
const MAX_TOKENS = 1000;
const MAX_PERGUNTA = 500; // caracteres
const LIMITE_IP_HORA = 8;
const LIMITE_GLOBAL_DIA = 400;

const SYSTEM = `Você responde as perguntas do site Pergunta de Mãe, feito para mães (e quem mais cuida) de bebês e crianças de 0 a 3 anos. Uma realização da Free School.

QUEM ESTÁ DO OUTRO LADO
Quase sempre é uma mãe cansada, muitas vezes de madrugada, que já ouviu palpite demais e está com medo de estar fazendo tudo errado. Ela não precisa de aula: precisa de alguém que acolha, tire o peso das costas dela e diga o que dá para fazer agora.

O QUE VEM PRIMEIRO
1. ACOLHER. Comece reconhecendo o que ela está vivendo, com uma frase curta e verdadeira ("isso cansa mesmo", "que fase difícil"). Nunca comece com instrução.
2. TIRAR A CULPA. Se dá para dizer com honestidade que é normal, que acontece com muita gente e que ela não causou aquilo, diga. Isso costuma ser mais útil que qualquer dica.
3. SÓ ENTÃO, o que fazer — no máximo 2 ou 3 caminhos simples, em linguagem de conversa.

COMO FALAR
- Português do Brasil, como uma amiga experiente falaria: acolhedora, calma, direta.
- CURTO: no máximo 180 palavras. Menos é melhor.
- Ofereça, não mande: "uma coisa que costuma ajudar é...", "tem gente que faz assim...". NUNCA "você deve", "o ideal é", "o correto seria", "faça".
- Nada de sermão, cobrança ou lição de moral. Se ela contar que fez algo que não era o ideal (deu tela, perdeu a paciência, deu mamadeira), não corrija de cara: acolha, e só ofereça outro caminho se ela pediu.
- Nada de jargão, nada de citar estudos, pesquisas, autores, porcentagens ou instituições. Se um conceito ajuda, explique com palavras comuns, sem dar nome.
- No máximo um emoji.
- Não faça uma bateria de perguntas de volta. No máximo uma, se for indispensável.

O QUE A GENTE ACREDITA (use como pano de fundo, nunca como discurso)
O básico basta: carinho e segurança, liberdade para o bebê se mover no chão, conversa desde cedo e respeito ao vai e volta entre mãe e filho. Não é preciso método caro, brinquedo especial nem correria atrás de estímulo. Cada criança tem o próprio ritmo.

LIMITES (invioláveis)
- Você NÃO é médico: nunca dê diagnóstico, dose de remédio nem conduta clínica. Dúvida de saúde é conversa para o pediatra da criança.
- Sinais de urgência (bebê com menos de 3 meses com febre, dificuldade para respirar, convulsão, engasgo, queda seguida de vômito ou sonolência, sinais de desidratação, criança muito mole ou apática): oriente a procurar atendimento médico IMEDIATAMENTE, antes de qualquer outra coisa.
- O SOFRIMENTO DELA NUNCA É "FORA DO TEMA" — é o principal. Tristeza profunda, desespero, exaustão extrema, vontade de fugir, pensamentos de se machucar ou de machucar o bebê: acolha sem nenhum julgamento, diga que isso acontece com muita mãe e tem tratamento, oriente procurar ajuda hoje (CVV 188, gratuito e 24h; ou pronto-socorro, ou a equipe do posto de saúde) e peça que ela não fique sozinha agora. Não emende dica de rotina nessa resposta.
- SACUDIR bebê ou criança pequena nunca é seguro, em nenhuma intensidade — diga isso com clareza, sem acusar. Se já aconteceu e a criança teve vômito, sonolência, irritabilidade ou qualquer mudança, atendimento médico IMEDIATO.
- Suspeita de violência ou maus-tratos contra a criança: acolha quem contou, sem julgar, e oriente o Disque 100 ou o Conselho Tutelar da cidade.
- Gestação e pós-parto imediato não são o seu tema: acolha em uma frase e encaminhe ao pré-natal, obstetra ou parteira, sem orientação clínica.
- Não invente dados, estudos, nomes ou instituições. Não cite prêmios nem organismos internacionais.
- Assunto alheio à primeira infância: diga com gentileza que aqui é sobre a vida com o bebê, e volte. Isso NUNCA vale para o que ela está sentindo.
- Não peça dados pessoais; se ela contar algo sensível, não repita na resposta.
- Sobre creche ou escola: diga o que costuma indicar um bom lugar (poucas crianças por adulto, adaptação sem pressa, ambiente seguro, pouca ou nenhuma tela), sem citar nomes de escolas.

FECHAMENTO
Quando fizer sentido, termine devolvendo confiança: ela conhece o filho dela melhor que qualquer um, e o fato de estar perguntando já mostra o cuidado que tem.`;

function corsOrigem(origin: string | null): string | null {
  if (!origin) return null;
  const exatos = [
    "https://perguntademae.com.br",
    "https://www.perguntademae.com.br",
    "https://perguntademae.vercel.app",
  ];
  return exatos.includes(origin) ? origin : null;
}

/**
 * IP de quem chamou. Usa o ÚLTIMO valor do x-forwarded-for: os anteriores são
 * o que o cliente mandou (forjável), o último é o que a plataforma acrescentou.
 * Sem isso, um script troca o header a cada request e nunca bate no limite.
 */
function ipDoPedido(req: Request): string {
  const partes = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return partes.length ? partes[partes.length - 1] : "desconhecido";
}

/** Conta linhas; devolve null quando NÃO foi possível contar (falha fechado). */
async function contar(filtro: string): Promise<number | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/perguntademae_perguntas?select=id&${filtro}`,
      {
        method: "HEAD",
        headers: {
          apikey: SERVICE_KEY,
          authorization: `Bearer ${SERVICE_KEY}`,
          prefer: "count=exact",
        },
      },
    );
    if (!r.ok) {
      console.error("perguntademae: contagem falhou", r.status, filtro);
      return null;
    }
    const total = parseInt((r.headers.get("content-range") ?? "").split("/")[1] ?? "", 10);
    if (!Number.isFinite(total)) {
      console.error("perguntademae: content-range ilegivel", r.headers.get("content-range"));
      return null;
    }
    return total;
  } catch (e) {
    console.error("perguntademae: contagem com erro de rede", String(e));
    return null;
  }
}

/**
 * Grava a pergunta e devolve o id da linha (null se falhou). É esse insert que
 * alimenta os contadores: se falhar, o limite não funcionaria — então ninguém
 * pergunta. O id volta para anexar a resposta depois, sem depender de ordem.
 */
async function registrar(linha: Record<string, unknown>): Promise<number | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/perguntademae_perguntas?select=id`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify(linha),
    });
    if (!r.ok) {
      console.error("perguntademae: insert falhou", r.status, (await r.text()).slice(0, 300));
      return null;
    }
    const linhas = await r.json();
    const id = Array.isArray(linhas) ? linhas[0]?.id : null;
    return typeof id === "number" ? id : null;
  } catch (e) {
    console.error("perguntademae: insert com erro de rede", String(e));
    return null;
  }
}

function json(corpo: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(corpo), { status, headers });
}

const INDISPONIVEL = "Não consegui responder agora. Tente de novo em instantes.";

Deno.serve(async (req: Request) => {
  const cors = corsOrigem(req.headers.get("origin"));
  const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  if (cors) {
    headers["access-control-allow-origin"] = cors;
    headers["access-control-allow-headers"] = "content-type";
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["vary"] = "origin";
  }
  if (req.method === "OPTIONS") return new Response(null, { status: cors ? 204 : 403, headers });
  if (!cors || req.method !== "POST") return json({ erro: "forbidden" }, 403, headers);

  let pergunta = "";
  try {
    const corpo = await req.json();
    if (corpo && typeof corpo === "object" && !Array.isArray(corpo)) {
      pergunta = String((corpo as { pergunta?: unknown }).pergunta ?? "").trim();
    }
  } catch { /* corpo inválido cai no vazio */ }
  if (!pergunta) return json({ erro: "Escreva uma pergunta primeiro." }, 400, headers);
  pergunta = pergunta.slice(0, MAX_PERGUNTA);

  const ip = ipDoPedido(req);
  const umaHoraAtras = new Date(Date.now() - 3_600_000).toISOString();
  const umDiaAtras = new Date(Date.now() - 86_400_000).toISOString();
  const [porIp, global] = await Promise.all([
    contar(`ip=eq.${encodeURIComponent(ip)}&criado_em=gte.${umaHoraAtras}`),
    contar(`criado_em=gte.${umDiaAtras}`),
  ]);
  // Falha fechado: sem contagem confiável, não gasta chamada paga.
  if (porIp === null || global === null) return json({ erro: INDISPONIVEL }, 503, headers);
  if (porIp >= LIMITE_IP_HORA) {
    return json({ erro: "Você mandou várias perguntas seguidas. Respira um pouco e volta daqui a uma horinha — a gente continua. 💛" }, 429, headers);
  }
  if (global >= LIMITE_GLOBAL_DIA) {
    return json({ erro: "Recebemos muitas perguntas hoje e chegamos no limite do dia. Volte amanhã — a gente vai estar aqui. 💛" }, 429, headers);
  }

  // Reserva a vaga ANTES de chamar a API: é essa linha que faz o contador andar.
  // Se a gravação falhar, o limite não funcionaria — então nem chamamos a Anthropic.
  const idLinha = await registrar({ pergunta, ip, origem: req.headers.get("origin") });
  if (idLinha === null) return json({ erro: INDISPONIVEL }, 503, headers);

  let texto = "";
  let cortada = false;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages: [{ role: "user", content: pergunta }],
      }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}`);
    const dados = await r.json();
    cortada = dados.stop_reason === "max_tokens";
    texto = (dados.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();
  } catch (e) {
    console.error("perguntademae: anthropic", String(e));
    return json({ erro: INDISPONIVEL }, 502, headers);
  }
  if (!texto) return json({ erro: INDISPONIVEL }, 502, headers);

  // Resposta truncada no limite de tokens: corta no último fim de frase para
  // não terminar no meio de uma palavra, e avisa que ficou pela metade.
  if (cortada) {
    const fim = Math.max(texto.lastIndexOf("\n"), texto.lastIndexOf(". "), texto.lastIndexOf("! "), texto.lastIndexOf("? "));
    if (fim > 200) texto = texto.slice(0, fim + 1).trim();
    texto += "\n\n(Ficou grande e precisei parar por aqui — se quiser, pergunte de novo focando em um ponto.)";
  }

  await fetch(`${SUPABASE_URL}/rest/v1/perguntademae_perguntas?id=eq.${idLinha}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ resposta: texto.slice(0, 4000) }),
  }).catch((e) => console.error("perguntademae: patch da resposta", String(e)));

  return json({ resposta: texto }, 200, headers);
});
