import type { RequestHandler, ErrorRequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

/** Express 4 não encaminha rejeições de handlers async ao middleware de erro. */
export function asyncHandler<P = ParamsDictionary>(handler: RequestHandler<P>): RequestHandler<P> {
  return (req, res, next) => {
    try { Promise.resolve(handler(req, res, next)).catch(next); }
    catch (error) { next(error); }
  };
}

export const responderErro: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const status = Number(error?.status);
  const codigo = Number.isInteger(status) && status >= 400 && status < 500 ? status : 503;
  console.error('[HTTP] Falha na requisição:', error?.message || 'Erro desconhecido');
  res.status(codigo).json({ error: codigo === 503 ? 'Serviço indisponível. Tente novamente.' : 'Requisição inválida.' });
};
