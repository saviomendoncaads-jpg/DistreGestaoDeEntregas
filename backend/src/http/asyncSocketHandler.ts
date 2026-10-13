/** Socket.io também não consome rejeições de callbacks async. */
export function asyncSocketHandler<T extends unknown[]>(handler: (...args: T) => Promise<void>): (...args: T) => void {
  return (...args) => {
    void handler(...args).catch(error => console.error('[Socket] Falha ao processar ação:', error?.message));
  };
}
