import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad · WhatsApp CRM",
  description:
    "Política de privacidad de la herramienta interna de gestión de mensajes (CRM).",
};

const LAST_UPDATED = "6 de julio de 2026";
const CONTACT_EMAIL = "tu-email@ejemplo.com"; // TODO: reemplazar por tu email real

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 px-5 py-12">
      <article className="mx-auto max-w-2xl">
        <header className="mb-8 border-b border-neutral-200 dark:border-neutral-800 pb-6">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-sm font-semibold text-white">
              W
            </div>
            <span className="text-sm font-semibold">WhatsApp CRM</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Política de Privacidad
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Última actualización: {LAST_UPDATED}
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-300">
          <section className="space-y-3">
            <p>
              Esta aplicación es una herramienta interna de gestión de mensajes
              (CRM) que permite recibir y responder consultas de clientes
              provenientes de <strong>WhatsApp</strong>,{" "}
              <strong>Instagram</strong> y <strong>Facebook Messenger</strong>,
              integrándose con dichas plataformas a través de las APIs oficiales
              de Meta. Esta política describe qué datos se procesan, con qué
              finalidad y cómo se protegen.
            </p>
          </section>

          <Section title="1. Datos que recopilamos">
            <p>En el marco de la gestión de conversaciones, la aplicación procesa:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                El <strong>contenido de los mensajes</strong> intercambiados
                entre el negocio y sus clientes (texto y, cuando corresponde,
                referencias a archivos adjuntos).
              </li>
              <li>
                El <strong>nombre de perfil o nombre de usuario</strong> del
                contacto, cuando la plataforma lo provee.
              </li>
              <li>
                Los <strong>identificadores de las plataformas</strong>
                necesarios para enrutar los mensajes: número de teléfono
                (WhatsApp) e identificadores internos de usuario como el
                Page-Scoped ID (PSID) de Messenger o el ID de usuario de
                Instagram (IGSID).
              </li>
              <li>
                Metadatos operativos asociados a cada mensaje, como la fecha y
                hora y el canal de origen.
              </li>
            </ul>
            <p>
              No solicitamos ni recopilamos deliberadamente datos sensibles. La
              aplicación no está destinada al público general: es una
              herramienta de uso interno del negocio.
            </p>
          </Section>

          <Section title="2. Para qué usamos los datos">
            <p>Los datos se utilizan exclusivamente para:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Recibir, visualizar, organizar y responder las consultas de
                clientes desde una única interfaz.
              </li>
              <li>
                Mantener el historial de cada conversación para dar continuidad
                a la atención.
              </li>
            </ul>
            <p>
              No utilizamos los datos con fines publicitarios ni los vendemos.
            </p>
          </Section>

          <Section title="3. Almacenamiento y seguridad">
            <p>
              Los datos se almacenan de forma segura en{" "}
              <strong>Supabase</strong> (infraestructura de base de datos
              alojada), con acceso restringido mediante autenticación. Las
              credenciales y tokens de acceso a las APIs se guardan como
              variables de entorno del servidor y nunca se exponen públicamente.
              El acceso a la herramienta requiere iniciar sesión.
            </p>
          </Section>

          <Section title="4. Compartir con terceros">
            <p>
              No compartimos los datos con terceros, salvo lo estrictamente
              necesario para operar el servicio: las <strong>plataformas de
              Meta</strong> (WhatsApp, Instagram y Facebook Messenger), a través
              de sus APIs oficiales, para poder entregar y recibir los mensajes;
              y el proveedor de base de datos (<strong>Supabase</strong>) donde
              se alojan los datos. Cada uno procesa la información según sus
              propias políticas.
            </p>
          </Section>

          <Section title="5. Integración con las plataformas de Meta">
            <p>
              Esta aplicación se integra con WhatsApp Business Platform,
              Instagram Messaging y Facebook Messenger utilizando las APIs
              oficiales de Meta. El uso de esas plataformas está sujeto además a
              las políticas de privacidad y condiciones de Meta.
            </p>
          </Section>

          <Section title="6. Retención de datos">
            <p>
              Los datos se conservan mientras sean necesarios para la gestión de
              la atención al cliente. Ante una solicitud, podemos eliminar los
              datos asociados a un contacto.
            </p>
          </Section>

          <Section title="7. Contacto">
            <p>
              Ante cualquier consulta sobre esta política o sobre el tratamiento
              de tus datos, escribinos a{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium text-emerald-700 underline dark:text-emerald-400"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>

        <footer className="mt-10 border-t border-neutral-200 dark:border-neutral-800 pt-6 text-xs text-neutral-400">
          © 2026 WhatsApp CRM · Herramienta interna.
        </footer>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      {children}
    </section>
  );
}
