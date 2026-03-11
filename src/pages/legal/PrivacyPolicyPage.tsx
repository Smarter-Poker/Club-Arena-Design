/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB ARENA — Privacy Policy
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useNavigate } from 'react-router-dom';
import styles from './LegalPage.module.css';

const sectionAnimationStyle = (index: number) => ({
    opacity: 0,
    transform: 'translateY(8px)',
    animation: `fadeInUp 0.5s ease-out ${index * 70}ms forwards`,
});

export default function PrivacyPolicyPage() {
    const navigate = useNavigate();

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={() => navigate(-1)}>
                    ← Back
                </button>
                <h1>Privacy Policy</h1>
            </div>

            <div className={styles.content}>
                <section style={sectionAnimationStyle(0)}>
                    <h2>Introduction</h2>
                    <p>
                        Club Arena ("we", "our", or "us") is committed to protecting your privacy.
                        This Privacy Policy explains how we collect, use, disclose, and safeguard your information
                        when you use our poker platform.
                    </p>
                </section>

                <section style={sectionAnimationStyle(1)}>
                    <h2>Information We Collect</h2>
                    <h3>Personal Information</h3>
                    <p>We collect information that you provide directly to us:</p>
                    <ul>
                        <li>Email address</li>
                        <li>Username and display name</li>
                        <li>Profile picture/avatar</li>
                        <li>Account preferences and settings</li>
                    </ul>

                    <h3>Gameplay Information</h3>
                    <ul>
                        <li>Hand histories and game statistics</li>
                        <li>Tournament results and rankings</li>
                        <li>Chip transactions and balances</li>
                        <li>Club memberships and roles</li>
                        <li>Chat messages and communications</li>
                    </ul>

                    <h3>Technical Information</h3>
                    <ul>
                        <li>IP address and device information</li>
                        <li>Browser type and version</li>
                        <li>Operating system</li>
                        <li>Login times and session duration</li>
                        <li>Cookies and similar technologies</li>
                    </ul>
                </section>

                <section style={sectionAnimationStyle(2)}>
                    <h2>How We Use Your Information</h2>
                    <p>We use the collected information for:</p>
                    <ul>
                        <li><strong>Service Provision:</strong> Operating and maintaining the platform</li>
                        <li><strong>Account Management:</strong> Creating and managing your account</li>
                        <li><strong>Game Integrity:</strong> Detecting and preventing cheating and fraud</li>
                        <li><strong>Communication:</strong> Sending updates, notifications, and support messages</li>
                        <li><strong>Improvement:</strong> Analyzing usage to improve our services</li>
                        <li><strong>Personalization:</strong> Customizing your experience</li>
                        <li><strong>Legal Compliance:</strong> Meeting legal and regulatory requirements</li>
                    </ul>
                </section>

                <section style={sectionAnimationStyle(3)}>
                    <h2>Information Sharing and Disclosure</h2>
                    <p>We do not sell your personal information. We may share information in these circumstances:</p>
                    <ul>
                        <li><strong>With Your Consent:</strong> When you explicitly agree</li>
                        <li><strong>Club Members:</strong> Your username and stats are visible to club members</li>
                        <li><strong>Service Providers:</strong> Third-party services that help us operate (hosting, analytics)</li>
                        <li><strong>Legal Requirements:</strong> When required by law or to protect rights and safety</li>
                        <li><strong>Business Transfers:</strong> In connection with mergers or acquisitions</li>
                    </ul>
                </section>

                <section style={sectionAnimationStyle(4)}>
                    <h2>Data Security</h2>
                    <p>We implement security measures to protect your information:</p>
                    <ul>
                        <li>Encryption of data in transit and at rest</li>
                        <li>Secure authentication and password hashing</li>
                        <li>Regular security audits and updates</li>
                        <li>Access controls and monitoring</li>
                        <li>Secure data centers and infrastructure</li>
                    </ul>
                    <p>
                        However, no method of transmission over the Internet is 100% secure.
                        We cannot guarantee absolute security.
                    </p>
                </section>

                <section style={sectionAnimationStyle(5)}>
                    <h2>Your Privacy Rights</h2>
                    <p>You have the right to:</p>
                    <ul>
                        <li><strong>Access:</strong> Request a copy of your personal data</li>
                        <li><strong>Correction:</strong> Update or correct inaccurate information</li>
                        <li><strong>Deletion:</strong> Request deletion of your account and data</li>
                        <li><strong>Export:</strong> Download your data in a portable format</li>
                        <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications</li>
                        <li><strong>Privacy Settings:</strong> Control what information is visible to others</li>
                    </ul>
                    <p>
                        To exercise these rights, contact us at privacy@smarter.poker
                    </p>
                </section>

                <section style={sectionAnimationStyle(6)}>
                    <h2>Cookies and Tracking</h2>
                    <p>We use cookies and similar technologies to:</p>
                    <ul>
                        <li>Maintain your session and keep you logged in</li>
                        <li>Remember your preferences and settings</li>
                        <li>Analyze usage patterns and improve our services</li>
                        <li>Provide personalized content and features</li>
                    </ul>
                    <p>
                        You can control cookies through your browser settings, but disabling them may affect functionality.
                    </p>
                </section>

                <section style={sectionAnimationStyle(7)}>
                    <h2>Children's Privacy</h2>
                    <p>
                        Club Arena is not intended for users under 18 years of age.
                        We do not knowingly collect information from children under 18.
                        If we discover that a child under 18 has provided us with personal information,
                        we will delete it immediately.
                    </p>
                </section>

                <section style={sectionAnimationStyle(8)}>
                    <h2>Data Retention</h2>
                    <p>
                        We retain your information for as long as your account is active or as needed to provide services.
                        After account deletion:
                    </p>
                    <ul>
                        <li>Personal information is deleted within 30 days</li>
                        <li>Anonymized gameplay statistics may be retained for analysis</li>
                        <li>Legal and compliance records are retained as required by law</li>
                    </ul>
                </section>

                <section style={sectionAnimationStyle(9)}>
                    <h2>International Data Transfers</h2>
                    <p>
                        Your information may be transferred to and processed in countries other than your own.
                        We ensure appropriate safeguards are in place to protect your data in accordance with this Privacy Policy.
                    </p>
                </section>

                <section style={sectionAnimationStyle(10)}>
                    <h2>Changes to This Policy</h2>
                    <p>
                        We may update this Privacy Policy from time to time.
                        We will notify you of any material changes by posting the new Privacy Policy on this page
                        and updating the "Last Updated" date.
                    </p>
                </section>

                <section style={sectionAnimationStyle(11)}>
                    <h2>Contact Us</h2>
                    <p>
                        If you have questions or concerns about this Privacy Policy, please contact us:
                    </p>
                    <ul>
                        <li>Email: privacy@smarter.poker</li>
                        <li>Support: support@smarter.poker</li>
                    </ul>
                </section>

                <div className={styles.lastUpdated}>
                    Last Updated: January 29, 2026
                </div>
            </div>
        </div>
    );
}
