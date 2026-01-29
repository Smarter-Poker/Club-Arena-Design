/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB ARENA — Fair Gaming Policy
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useNavigate } from 'react-router-dom';
import styles from './LegalPage.module.css';

export default function FairGamingPage() {
    const navigate = useNavigate();

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={() => navigate(-1)}>
                    ← Back
                </button>
                <h1>Fair Gaming Policy</h1>
            </div>

            <div className={styles.content}>
                <section>
                    <h2>Our Commitment to Fair Play</h2>
                    <p>
                        Club Arena is committed to providing a fair, secure, and enjoyable poker experience for all players.
                        We employ industry-leading technology and practices to ensure game integrity.
                    </p>
                </section>

                <section>
                    <h2>Random Number Generation (RNG)</h2>
                    <p>
                        All card shuffling and dealing in Club Arena uses a certified Random Number Generator (RNG):
                    </p>
                    <ul>
                        <li>Cryptographically secure random number generation</li>
                        <li>Each shuffle is completely independent and unpredictable</li>
                        <li>No patterns or predictability in card distribution</li>
                        <li>Regular third-party audits to verify randomness</li>
                    </ul>
                </section>

                <section>
                    <h2>Game Integrity</h2>
                    <p>
                        We maintain game integrity through multiple safeguards:
                    </p>
                    <ul>
                        <li><strong>Secure Servers:</strong> All games run on secure, monitored servers</li>
                        <li><strong>Encrypted Communication:</strong> All data transmission is encrypted</li>
                        <li><strong>Anti-Cheating Detection:</strong> Automated systems detect suspicious patterns</li>
                        <li><strong>Hand History Verification:</strong> All hands are logged and can be reviewed</li>
                    </ul>
                </section>

                <section>
                    <h2>Prohibited Activities</h2>
                    <p>
                        The following activities are strictly prohibited and will result in immediate account termination:
                    </p>
                    <ul>
                        <li><strong>Collusion:</strong> Working with other players to gain an unfair advantage</li>
                        <li><strong>Multi-Accounting:</strong> Using multiple accounts at the same table</li>
                        <li><strong>Chip Dumping:</strong> Intentionally losing chips to another player</li>
                        <li><strong>Bot Usage:</strong> Using automated software to play</li>
                        <li><strong>Real-Time Assistance (RTA):</strong> Using external tools during play</li>
                        <li><strong>Account Sharing:</strong> Allowing others to play on your account</li>
                        <li><strong>Ghosting:</strong> Receiving advice from others during play</li>
                    </ul>
                </section>

                <section>
                    <h2>Detection and Monitoring</h2>
                    <p>
                        Our security team actively monitors for unfair play:
                    </p>
                    <ul>
                        <li>Automated pattern detection algorithms</li>
                        <li>Manual review of flagged accounts</li>
                        <li>Player reports and investigations</li>
                        <li>Statistical analysis of play patterns</li>
                        <li>IP address and device fingerprinting</li>
                    </ul>
                </section>

                <section>
                    <h2>Player Reporting</h2>
                    <p>
                        If you suspect unfair play, you can report it:
                    </p>
                    <ul>
                        <li>Use the "Report Player" button at the table</li>
                        <li>Provide hand numbers and specific details</li>
                        <li>Include any supporting evidence</li>
                        <li>Reports are reviewed within 24-48 hours</li>
                    </ul>
                    <p>
                        All reports are confidential and investigated thoroughly.
                    </p>
                </section>

                <section>
                    <h2>Consequences of Cheating</h2>
                    <p>
                        Players found violating fair play rules face:
                    </p>
                    <ul>
                        <li><strong>First Offense:</strong> Warning and temporary suspension (7-30 days)</li>
                        <li><strong>Second Offense:</strong> Extended suspension (30-90 days) and chip confiscation</li>
                        <li><strong>Third Offense:</strong> Permanent account termination</li>
                        <li><strong>Severe Violations:</strong> Immediate permanent ban</li>
                    </ul>
                    <p>
                        Ill-gotten chips will be confiscated and redistributed to affected players when possible.
                    </p>
                </section>

                <section>
                    <h2>Hand History Access</h2>
                    <p>
                        All players have access to their hand histories:
                    </p>
                    <ul>
                        <li>View all hands you've played</li>
                        <li>Download hand histories for analysis</li>
                        <li>Share hands with friends or coaches</li>
                        <li>Verify game outcomes and actions</li>
                    </ul>
                </section>

                <section>
                    <h2>Dispute Resolution</h2>
                    <p>
                        If you believe a game outcome was unfair:
                    </p>
                    <ul>
                        <li>Contact support@smarter.poker with the hand number</li>
                        <li>Our team will review the hand history</li>
                        <li>You will receive a response within 48 hours</li>
                        <li>If an error is found, appropriate compensation will be provided</li>
                    </ul>
                </section>

                <section>
                    <h2>Continuous Improvement</h2>
                    <p>
                        We continuously improve our fair play systems:
                    </p>
                    <ul>
                        <li>Regular security audits</li>
                        <li>Updates to detection algorithms</li>
                        <li>Community feedback integration</li>
                        <li>Industry best practice adoption</li>
                    </ul>
                </section>

                <div className={styles.lastUpdated}>
                    Last Updated: January 29, 2026
                </div>
            </div>
        </div>
    );
}
