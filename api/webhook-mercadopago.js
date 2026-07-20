/**
 * POST /api/webhook-mercadopago
 *
 * É o Mercado Pago quem chama esta rota — sozinho, sempre que o status
 * de uma assinatura muda (pagou, atrasou, cancelou).
 *
 * Esta função é a ÚNICA que libera acesso. O navegador do usuário nunca
 * escreve "assinatura_ativa = true" — só lê. Isso impede que alguém
 * libere o próprio acesso mexendo no console do navegador.
 *
 * Configure no painel do Mercado Pago:
 *   Suas integrações → Webhooks → URL:
 *   https://meutaf.com.br/api/webhook-mercadopago
 *   Evento: "Assinaturas" (preapproval)
 */

export default async function handler(req, res) {
  // Responde rápido: o Mercado Pago reenvia se demorar.
  if (req.method !== 'POST') return res.status(405).end();

  const { MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Webhook sem variáveis de ambiente configuradas.');
    return res.status(200).end(); // 200 pra não gerar retry infinito
  }

  try {
    const corpo = req.body || {};
    const preapprovalId = corpo?.data?.id || corpo?.id;
    if (!preapprovalId) return res.status(200).end();

    // 1) Pergunta ao Mercado Pago o estado REAL da assinatura.
    //    Nunca confiar só no que veio no corpo da notificação.
    const r = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!r.ok) {
      console.error('Não consegui consultar a assinatura no MP:', preapprovalId);
      return res.status(200).end();
    }
    const assinatura = await r.json();

    const userId = assinatura.external_reference;
    if (!userId) return res.status(200).end();

    // status possíveis: authorized | paused | cancelled | pending
    const ativa = assinatura.status === 'authorized';

    // Data da próxima cobrança → serve de validade do acesso
    const proxima =
      assinatura?.next_payment_date ||
      assinatura?.summarized?.next_payment_date ||
      null;

    const mapaStatus = {
      authorized: 'ativa',
      pending: 'pendente',
      paused: 'pausada',
      cancelled: 'cancelada',
    };

    // 2) Grava no Supabase com a chave service_role (só existe no servidor).
    const upd = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        assinatura_ativa: ativa,
        assinatura_status: mapaStatus[assinatura.status] || assinatura.status,
        assinatura_expira_em: proxima,
        mp_preapproval_id: preapprovalId,
        atualizado_em: new Date().toISOString(),
      }),
    });

    if (!upd.ok) console.error('Falha ao atualizar profiles:', await upd.text());

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Erro no webhook:', e);
    return res.status(200).end();
  }
}
