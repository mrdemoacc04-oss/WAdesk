import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { appName, companyName, privacyEmail } from "@/lib/server/env";

export const metadata = { title: "Privacy Policy" };

const UPDATED = "16 October 2026";

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-medium tracking-[-0.02em]">
        <span className="mr-2 text-ink-4">{n}.</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

const Ul = ({ children }: { children: React.ReactNode }) => <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-4">{children}</ul>;

/** Public (no sign-in needed) so it can be linked from the login page and shared with the people being messaged. */
export default function Page() {
  return (
    <div className="grain relative min-h-dvh">
      <div className="relative z-[2] mx-auto max-w-[720px] px-5 pb-24 pt-8 sm:pt-12">
        <div className="flex items-center justify-between">
          <Link href="/" className="outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
            <Wordmark name={appName} />
          </Link>
          <Link href="/login" className="text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink">
            Sign in
          </Link>
        </div>

        <h1 className="mt-14 text-[40px] font-medium leading-[1.05] tracking-[-0.035em]">Privacy Policy</h1>
        <p className="mt-3 text-sm text-ink-3">Last updated {UPDATED}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-ink-2">
          This policy explains what personal data {appName} collects, why, who it is shared with and what choices you have. {appName} is a WhatsApp marketing and shared-inbox tool operated by {companyName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        </p>

        <Section n={1} title="Two roles, so you know who is responsible">
          <p>
            <strong className="font-medium text-ink">Your account.</strong> When you sign up or are invited to a workspace, we decide how your account details are used, so we are responsible for them.
          </p>
          <p>
            <strong className="font-medium text-ink">Your customers&apos; data.</strong> The contacts, messages and files a workspace adds to {appName} belong to that workspace — the business using it. The business decides why and how they are used and is responsible for having permission to message people. We process that data on the business&apos;s behalf, only to provide the service. If you are a customer of a business that uses {appName}, please contact that business about your data.
          </p>
        </Section>

        <Section n={2} title="What we collect">
          <Ul>
            <li>
              <strong className="font-medium text-ink">Account and team:</strong> email address, name, workspace name, role, and your password — which is stored only as a salted hash by our sign-in provider; we never see it.
            </li>
            <li>
              <strong className="font-medium text-ink">Workspace data you add:</strong> contacts (phone number, name, email, country, tags, custom fields, notes, opt-in status and source, and when consent was given or withdrawn), conversations and messages (text, media, delivery status, timestamps), message templates, campaigns and their recipient lists, quick replies, automation rules and saved segments.
            </li>
            <li>
              <strong className="font-medium text-ink">WhatsApp connection:</strong> the phone number ID, business account ID, access token and app secret. The token and secret are encrypted before they are stored, are never shown again after saving, are never included in exports, and are never sent to your browser.
            </li>
            <li>
              <strong className="font-medium text-ink">Technical data:</strong> our hosting provider&apos;s server logs (IP address, browser type, pages requested, time) for security and reliability.
            </li>
          </Ul>
        </Section>

        <Section n={3} title="How we use it">
          <Ul>
            <li>To provide the service: send the messages you ask us to send, show your inbox, run your automations and show your analytics.</li>
            <li>To email you about your account: confirmation, password reset, team invitations.</li>
            <li>To keep the service secure and reliable, investigate abuse and fix problems.</li>
            <li>To meet legal obligations.</li>
          </Ul>
          <p>We do not sell personal data. {appName} contains no advertising and no third-party tracking.</p>
        </Section>

        <Section n={4} title="WhatsApp and Meta">
          <p>
            Messages are sent and received through the WhatsApp Business Platform, which is operated by Meta. Meta handles those messages under its own terms and privacy policy (see the{" "}
            <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-4">
              WhatsApp Privacy Policy
            </a>
            ).
          </p>
          <p>
            Businesses must have people&apos;s permission (opt-in) before sending them marketing messages. {appName} records each contact&apos;s consent status and honours opt-out requests such as &ldquo;STOP&rdquo;.
          </p>
        </Section>

        <Section n={5} title="Service providers we use">
          <p>We rely on a small number of providers to run {appName}. They process data only to provide their service to us:</p>
          <Ul>
            <li>
              <strong className="font-medium text-ink">Supabase</strong> — database, sign-in and file storage
            </li>
            <li>
              <strong className="font-medium text-ink">Vercel</strong> — hosting and delivery of the application
            </li>
            <li>
              <strong className="font-medium text-ink">Meta (WhatsApp)</strong> — sending and receiving WhatsApp messages
            </li>
            <li>
              <strong className="font-medium text-ink">An email delivery provider</strong> (for example Resend) — account emails such as confirmations and password resets
            </li>
          </Ul>
          <p>We may also disclose information when the law requires it, or to protect the rights, safety and security of our users and the service.</p>
        </Section>

        <Section n={6} title="Files you upload">
          <p>
            Images, videos and documents you upload to use in templates and messages are kept in cloud storage at a unique web address so that WhatsApp can fetch them. Anyone who has that exact address can open the file, so please don&apos;t upload anything confidential that you would not want reachable by link.
          </p>
        </Section>

        <Section n={7} title="Cookies and local storage">
          <p>
            We use only what is needed to run the service: a sign-in session cookie that keeps you signed in, and your browser&apos;s local storage for preferences such as the light or dark theme and inbox settings. We do not use advertising, analytics or tracking cookies.
          </p>
        </Section>

        <Section n={8} title="Security">
          <p>
            Traffic is encrypted with HTTPS. WhatsApp credentials are encrypted at rest (AES-256-GCM). Each workspace&apos;s data is isolated from every other workspace at the database level, and access inside a workspace is role-based (owner, admin, agent). Service credentials stay on the server. No system is perfectly secure — if you suspect a problem, please tell us straight away.
          </p>
        </Section>

        <Section n={9} title="How long we keep data">
          <p>
            We keep workspace data while the workspace is active. Admins can export contacts as a CSV file and delete contacts, templates and campaigns at any time. When a workspace is closed we delete or anonymise its data within a reasonable period, unless the law requires us to keep something longer (for example security logs). Backups are overwritten on their normal schedule.
          </p>
        </Section>

        <Section n={10} title="Your rights">
          <p>
            Depending on where you live, you may have the right to access your personal data, correct it, delete it, restrict or object to how it is used, receive a copy, and withdraw consent. For your account, contact us using the details below. For data a business holds about you as its customer, please contact that business. You can also complain to your local data-protection authority. We aim to handle personal data in line with applicable law, including India&apos;s Digital Personal Data Protection Act, 2023 and, where it applies, the GDPR.
          </p>
        </Section>

        <Section n={11} title="International transfers">
          <p>Our providers operate around the world, so your data may be processed in countries other than your own. Where the law requires it, we rely on appropriate safeguards for those transfers.</p>
        </Section>

        <Section n={12} title="Children">
          <p>{appName} is for businesses and is not directed at anyone under 18. We do not knowingly collect personal data from children.</p>
        </Section>

        <Section n={13} title="Changes to this policy">
          <p>If we change this policy we will update the date at the top and, for significant changes, tell you by email or inside the app.</p>
        </Section>

        <Section n={14} title="Contact us">
          {privacyEmail ? (
            <p>
              Questions or requests about your personal data:{" "}
              <a href={`mailto:${privacyEmail}`} className="font-medium text-ink underline underline-offset-4">
                {privacyEmail}
              </a>
              . {companyName} operates this service.
            </p>
          ) : (
            <p>To ask a question or make a request about your personal data, contact {companyName}, which operates this service, using the contact details you were given when you signed up.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
