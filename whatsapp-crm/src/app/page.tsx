export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-4">
        <h1 className="text-2xl font-semibold">WhatsApp CRM</h1>
        <p className="text-sm text-neutral-500">
          Herramienta interna. El Inbox llega en la Fase 2.
        </p>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 text-sm space-y-1">
          <p className="font-medium">Webhook</p>
          <code className="text-xs break-all text-neutral-500">
            /api/whatsapp/webhook
          </code>
          <p className="text-xs text-neutral-500">
            Configurá esta URL (deployada) como Callback URL en Meta y suscribí
            el evento <span className="font-mono">messages</span>.
          </p>
        </div>
      </div>
    </main>
  );
}
