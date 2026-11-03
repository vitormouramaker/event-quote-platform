// Força o app a pegar a versão nova. Como o index.html é servido sem cache
// (nginx), um reload normal já busca o index fresco -> novos bundles hasheados.
// Limpamos também o Cache Storage (caso exista, por segurança) mas NÃO o
// localStorage/token — não deslogar o usuário a cada atualização.
export async function forceAppRefresh(): Promise<void> {
  try {
    if (typeof caches !== "undefined" && caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache Storage indisponível: segue para o reload.
  }
  window.location.reload();
}
