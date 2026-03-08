/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB ARENA — Terms of Service
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useNavigate } from 'react-router-dom';
import styles from './LegalPage.module.css';

export default function TermsOfServicePage() {
    const navigate = useNavigate();

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={() => navigate(-1)}>
                    ← Back
                </button>
                <h1>Terms of Service</h1>
            </div>

            <div className={styles.content}>
                <section>
                    <h2>1. Acceptance of Terms</h2>
                    <p>
                        By accessing and using Club Arena, you accept and agree to be bound by the terms and provision of this agreement.
                        If you do not agree to abide by the above, please do not use this service.
                    </p>
                </section>

                <section>
                    <h2>2. Use License</h2>
                    <p>
                        Permission is granted to temporarily access Club Arena for personal, non-commercial use only.
                        This is the grant of a license, not a transfer of title, and under this license you may not:
                    </p>
                    <ul>
                        <li>Modify or copy the materials</li>
                        <li>Use the materials for any commercial purpose or for any public display</li>
                        <li>Attempt to reverse engineer any software contained in Club Arena</li>
                        <li>Remove any copyright or other proprietary notations from the materials</li>
                        <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
                    </ul>
                </section>

                <section>
                    <h2>3. Account Responsibilities</h2>
                    <p>
                        You are responsible for maintaining the confidentiality of your account and password.
                        You agree to accept responsibility for all activities that occur under your account.
                    </p>
                </section>

                <section>
                    <h2>4. Play Money Only</h2>
                    <p>
                        Club Arena uses play money chips only. All chips, diamonds, and virtual currency have no real-world monetary value
                        and cannot be exchanged for real money or prizes.
                    </p>
                </section>

                <section>
                    <h2>5. Fair Play</h2>
                    <p>
                        Users must play fairly and not use any unauthorized automated tools or collusion with other players.
                        Violation of fair play rules may result in account suspension or termination.
                    </p>
                </section>

                <section>
                    <h2>6. Content and Conduct</h2>
                    <p>
                        Users must not post, transmit, or otherwise make available any content that is:
                    </p>
                    <ul>
                        <li>Unlawful, harmful, threatening, abusive, harassing, or otherwise objectionable</li>
                        <li>Invasive of another's privacy</li>
                        <li>Infringes any intellectual property or other proprietary rights</li>
                        <li>Contains software viruses or any other malicious code</li>
                    </ul>
                </section>

                <section>
                    <h2>7. Termination</h2>
                    <p>
                        We may terminate or suspend your account and bar access to the service immediately, without prior notice or liability,
                        under our sole discretion, for any reason whatsoever, including without limitation if you breach the Terms.
                    </p>
                </section>

                <section>
                    <h2>8. Limitation of Liability</h2>
                    <p>
                        In no event shall Club Arena, nor its directors, employees, partners, agents, suppliers, or affiliates,
                        be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation,
                        loss of profits, data, use, goodwill, or other intangible losses.
                    </p>
                </section>

                <section>
                    <h2>9. Changes to Terms</h2>
                    <p>
                        We reserve the right, at our sole discretion, to modify or replace these Terms at any time.
                        We will provide notice of any material changes by posting the new Terms on this page.
                    </p>
                </section>

                <section>
                    <h2>10. Contact Us</h2>
                    <p>
                        If you have any questions about these Terms, please contact us at support@smarter.poker
                    </p>
                </section>

                <div className={styles.lastUpdated}>
                    Last Updated: January 29, 2026
                </div>
            </div>
        </div>
    );
}
