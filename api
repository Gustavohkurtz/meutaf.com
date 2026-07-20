/**
 * POST /api/criar-assinatura
 *
 * Cria uma assinatura recorrente (preapproval) no Mercado Pago
 * e devolve o link de pagamento (init_point) pro navegador.
 *
 * IMPORTANTE: o Access Token do Mercado Pago NUNCA aparece aqui no código.
 * Ele é lido de process.env.MP_ACCESS_TOKEN, que você cadastra no painel
 * da Vercel (Settings → Environment Variables). Nunca cole essa chave em
 * chat, e-mail, print ou commit.
 *
 * Variáveis de ambiente necessárias na Vercel:
 *   MP_ACCESS_TOKEN            → Access Token de PRODUÇÃO do Mercado Pago
 *   SUPABASE_URL               → https://wyxehqagbfaquzwfmkzg.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  → chave service_role do Supabase (secreta!)
 *   SITE_URL                   → https://meutaf.com.br
 */

const PRECO_MENSAL = 39.9;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido.' });
  }

  const {
    MP_ACCESS_TOKEN,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SITE_URL = 'https://meutaf.com.br',
  } = process.env;

  if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      erro: 'Servidor sem configuração. Faltam variáveis de ambiente na Vercel.',
    });
  }

  // 1) Confere quem é o usuário pelo token do Supabase enviado pelo front.
  //    Isso impede que alguém crie assinatura em nome de outra pessoa.
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return res.status(401).json({ erro: 'Faça login antes de assinar.' });

  let usuario;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
    });
    if (!r.ok) throw new Error('token inválido');
    usuario = await r.json();
  } catch {
    return res.status(401).json({ erro: 'Sessão expirada. Entre de novo na sua conta.' });
  }

  if (!usuario?.id || !usuario?.email) {
    return res.status(401).json({ erro: 'Não consegui identificar sua conta.' });
  }

  // 2) Cria a assinatura recorrente no Mercado Pago.
  //    external_reference = id do usuário → é assim que o webhook sabe
  //    de quem é o pagamento quando o Mercado Pago avisar.
  try {
    const mpResp = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: 'TAF.PREP — Plano mensal',
        external_reference: usuario.id,
        payer_email: usuario.email,
        back_url: `${SITE_URL}/?assinatura=retorno`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PRECO_MENSAL,
          currency_id: 'BRL',
        },
        status: 'pending',
      }),
    });

    const dados = await mpResp.json();

    if (!mpResp.ok) {
      console.error('Erro Mercado Pago:', dados);
      return res.status(502).json({
        erro: dados?.message || 'O Mercado Pago recusou a criação da assinatura.',
      });
    }

    // 3) Marca como "pendente" no Supabase enquanto o pagamento não confirma.
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${usuario.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        assinatura_status: 'pendente',
        mp_preapproval_id: dados.id,
      }),
    });

    return res.status(200).json({ init_point: dados.init_point });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: 'Falha inesperada ao criar a assinatura.' });
  }
}
