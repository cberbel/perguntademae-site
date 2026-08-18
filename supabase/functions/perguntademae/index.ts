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
const LIMITE_HORA_CADASTRADA = 20; // quem se cadastrou tem mais folga
// O portão das 7 perguntas mora no NAVEGADOR (localStorage). Aqui em cima fica
// só um freio de abuso bem folgado por IP: no Brasil muita mãe navega por rede
// móvel com CGNAT, ou seja, várias pessoas atrás do MESMO IP — um portão baixo
// por IP barraria mãe inocente na primeira pergunta.
const LIVRES_POR_IP = 25;
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

CONTEXTO
Às vezes chega um bloco CONTEXTO antes da pergunta, com a idade do bebê e o que já foi conversado. Use para ajustar a resposta (o que serve para um bebê de 4 meses não serve para um de 2 anos) e fale como quem lembra da conversa. NUNCA devolva esses dados como se estivesse conferindo um cadastro, e nunca repita o telefone, o e-mail ou o endereço dela.

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


/** Só dígitos, para telefone e CEP. */
function digitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function dataValida(v: unknown, anosMax: number): string | null {
  const t = String(v ?? "").trim();
  // aceita AAAA-MM (input type=month) e AAAA-MM-DD
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(t);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3] ?? "01"}`;
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const agora = Date.now();
  if (d.getTime() > agora) return null;                       // não pode ser futuro
  if (agora - d.getTime() > anosMax * 365.25 * 86_400_000) return null;
  return iso;
}

/** Cadastro da mãe. Devolve o token (a identidade dela daqui pra frente) ou um erro. */
async function cadastrar(corpo: Record<string, unknown>, ip: string): Promise<{ token?: string; protocolo?: string; erro?: string }> {
  if (corpo.consentimento !== true) return { erro: "Para guardar suas conversas, precisamos do seu aceite." };
  const whatsapp = digitos(corpo.whatsapp);
  if (whatsapp.length < 10 || whatsapp.length > 13) return { erro: "Confira o WhatsApp com DDD." };
  const email = String(corpo.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 120) return { erro: "Confira o e-mail." };
  const nascCrianca = dataValida(corpo.nasc_crianca, 6);
  if (!nascCrianca) return { erro: "Confira o mês e o ano de nascimento do bebê." };
  const nascMae = dataValida(corpo.nasc_mae, 80);              // opcional
  const cepBruto = digitos(corpo.cep);
  const cep = cepBruto.length === 8 ? cepBruto : null;         // opcional
  const bairro = String(corpo.bairro ?? "").trim().slice(0, 80) || null;

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/perguntademae_maes?select=token,protocolo`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({ whatsapp, email, nasc_crianca: nascCrianca, nasc_mae: nascMae, cep, bairro, ip }),
    });
    if (!r.ok) {
      console.error("perguntademae: cadastro falhou", r.status, (await r.text()).slice(0, 300));
      return { erro: INDISPONIVEL };
    }
    const linhas = await r.json();
    const token = Array.isArray(linhas) ? linhas[0]?.token : null;
    const protocolo = Array.isArray(linhas) ? linhas[0]?.protocolo : null;
    return typeof token === "string" ? { token, protocolo } : { erro: INDISPONIVEL };
  } catch (e) {
    console.error("perguntademae: cadastro com erro de rede", String(e));
    return { erro: INDISPONIVEL };
  }
}

interface Mae { id: number; nasc_crianca: string; protocolo: string }

/** Traduz o token do navegador em uma mãe de verdade. NUNCA confiar em id vindo do cliente. */
async function buscarMae(token: unknown): Promise<Mae | null> {
  const t = String(token ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/perguntademae_maes?token=eq.${t}&select=id,nasc_crianca,protocolo`,
      { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!r.ok) return null;
    const linhas = await r.json();
    return Array.isArray(linhas) && linhas[0] ? linhas[0] as Mae : null;
  } catch {
    return null;
  }
}

/** Últimas trocas dessa mãe — é o que dá memória à conversa. */
async function historico(maeId: number, limite: number): Promise<{ pergunta: string; resposta: string | null }[]> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/perguntademae_perguntas?mae_id=eq.${maeId}&resposta=not.is.null&select=pergunta,resposta&order=id.desc&limit=${limite}`,
      { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!r.ok) return [];
    const linhas = await r.json();
    return Array.isArray(linhas) ? linhas.reverse() : [];
  } catch {
    return [];
  }
}

function idadeEmMeses(nasc: string): number {
  const d = new Date(nasc + "T00:00:00Z");
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (30.44 * 86_400_000)));
}

function descreveIdade(meses: number): string {
  if (meses < 1) return "recém-nascido";
  if (meses < 24) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return resto ? `${anos} anos e ${resto} ${resto === 1 ? "mês" : "meses"}` : `${anos} anos`;
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

  let corpo: Record<string, unknown> = {};
  try {
    const lido = await req.json();
    if (lido && typeof lido === "object" && !Array.isArray(lido)) corpo = lido as Record<string, unknown>;
  } catch { /* corpo inválido fica vazio */ }

  const ip = ipDoPedido(req);
  const acao = String(corpo.acao ?? "pergunta");

  // --- cadastro: devolve o token que passa a identificar essa mãe ---
  if (acao === "cadastro") {
    const r = await cadastrar(corpo, ip);
    return r.token ? json({ token: r.token, protocolo: r.protocolo }, 200, headers) : json({ erro: r.erro }, 400, headers);
  }

  // --- histórico: as conversas anteriores dela ---
  if (acao === "historico") {
    const mae = await buscarMae(corpo.token);
    if (!mae) return json({ conversas: [] }, 200, headers);
    return json({ conversas: await historico(mae.id, 20), protocolo: mae.protocolo }, 200, headers);
  }

  let pergunta = String(corpo.pergunta ?? "").trim();
  if (!pergunta) return json({ erro: "Escreva uma pergunta primeiro." }, 400, headers);
  pergunta = pergunta.slice(0, MAX_PERGUNTA);

  const mae = await buscarMae(corpo.token);
  const umaHoraAtras = new Date(Date.now() - 3_600_000).toISOString();
  const umDiaAtras = new Date(Date.now() - 86_400_000).toISOString();
  const [porIp, global] = await Promise.all([
    contar(mae
      ? `mae_id=eq.${mae.id}&criado_em=gte.${umaHoraAtras}`
      : `ip=eq.${encodeURIComponent(ip)}&criado_em=gte.${umaHoraAtras}`),
    contar(`criado_em=gte.${umDiaAtras}`),
  ]);
  // Falha fechado: sem contagem confiável, não gasta chamada paga.
  if (porIp === null || global === null) return json({ erro: INDISPONIVEL }, 503, headers);

  // O PORTÃO: as primeiras perguntas são livres; depois delas, só quem se
  // cadastrou continua. Vale no servidor porque limpar o navegador não burla.
  if (!mae) {
    const trintaDias = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const jaFeitas = await contar(`ip=eq.${encodeURIComponent(ip)}&criado_em=gte.${trintaDias}`);
    if (jaFeitas === null) return json({ erro: INDISPONIVEL }, 503, headers);
    if (jaFeitas >= LIVRES_POR_IP) {
      return json({
        precisaCadastro: true,
        erro: "Para continuar conversando e guardar suas perguntas, faça um cadastro rapidinho. 💛",
      }, 403, headers);
    }
  }

  if (porIp >= (mae ? LIMITE_HORA_CADASTRADA : LIMITE_IP_HORA)) {
    return json({ erro: "Você mandou várias perguntas seguidas. Respira um pouco e volta daqui a uma horinha — a gente continua. 💛" }, 429, headers);
  }
  if (global >= LIMITE_GLOBAL_DIA) {
    return json({ erro: "Recebemos muitas perguntas hoje e chegamos no limite do dia. Volte amanhã — a gente vai estar aqui. 💛" }, 429, headers);
  }

  // Reserva a vaga ANTES de chamar a API: é essa linha que faz o contador andar.
  // Se a gravação falhar, o limite não funcionaria — então nem chamamos a Anthropic.
  const idLinha = await registrar({ pergunta, ip, origem: req.headers.get("origin"), mae_id: mae?.id ?? null });
  if (idLinha === null) return json({ erro: INDISPONIVEL }, 503, headers);

  // Memória da conversa: quem se cadastrou traz junto a idade do bebê e as
  // últimas trocas, para a resposta não recomeçar do zero toda vez.
  const mensagens: { role: "user" | "assistant"; content: string }[] = [];
  if (mae) {
    const anteriores = await historico(mae.id, 6);
    for (const t of anteriores) {
      mensagens.push({ role: "user", content: t.pergunta });
      if (t.resposta) mensagens.push({ role: "assistant", content: t.resposta });
    }
    const idade = descreveIdade(idadeEmMeses(mae.nasc_crianca));
    mensagens.push({ role: "user", content: `CONTEXTO: o bebê desta mãe tem ${idade}.

${pergunta}` });
  } else {
    mensagens.push({ role: "user", content: pergunta });
  }

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
        messages: mensagens,
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
