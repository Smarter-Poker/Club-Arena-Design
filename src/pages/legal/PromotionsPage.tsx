/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLUB ARENA — Club Promotion Rules
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useNavigate } from 'react-router-dom';
import styles from './LegalPage.module.css';

export default function PromotionsPage() {
    const navigate = useNavigate();

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={() => navigate(-1)}>
                    ← Back
                </button>
                <h1>Club Promotion Rules</h1>
            </div>

            <div className={styles.content}>
                <section>
                    <h2>1. General Promotion Guidelines</h2>
                    <p>
                        All promotions, bonuses, and special offers in Club Arena are subject to these rules.
                        By participating in any promotion, you agree to abide by these terms.
                    </p>
                </section>

                <section>
                    <h2>2. Eligibility</h2>
                    <p>
                        Promotions are available to all registered Club Arena users unless otherwise specified.
                        Users must have an active account in good standing to participate.
                    </p>
                    <ul>
                        <li>One promotion per user unless stated otherwise</li>
                        <li>Users with suspended or banned accounts are not eligible</li>
                        <li>Club owners may set additional eligibility requirements for club-specific promotions</li>
                    </ul>
                </section>

                <section>
                    <h2>3. Daily Bonuses</h2>
                    <p>
                        Daily bonuses are awarded for consecutive daily logins:
                    </p>
                    <ul>
                        <li>Day 1: 100 chips</li>
                        <li>Day 2: 200 chips</li>
                        <li>Day 3: 300 chips</li>
                        <li>Day 4: 400 chips</li>
                        <li>Day 5: 500 chips</li>
                        <li>Day 6: 600 chips</li>
                        <li>Day 7: 1000 chips + 100 Diamonds</li>
                    </ul>
                    <p>
                        Missing a day resets your streak to Day 1.
                    </p>
                </section>

                <section>
                    <h2>4. Tournament Promotions</h2>
                    <p>
                        Tournament promotions may include:
                    </p>
                    <ul>
                        <li>Freeroll tournaments with guaranteed prize pools</li>
                        <li>Reduced buy-in tournaments</li>
                        <li>Satellite tournaments to larger events</li>
                        <li>Special tournament series with leaderboards</li>
                    </ul>
                    <p>
                        All tournament promotions are subject to the tournament's specific terms and conditions.
                    </p>
                </section>

                <section>
                    <h2>5. Rakeback and Loyalty Rewards</h2>
                    <p>
                        Rakeback is calculated based on the rake contributed in cash games and tournament fees:
                    </p>
                    <ul>
                        <li>Bronze VIP: 5% rakeback</li>
                        <li>Silver VIP: 10% rakeback</li>
                        <li>Gold VIP: 15% rakeback</li>
                        <li>Platinum VIP: 20% rakeback</li>
                        <li>Diamond VIP: 25% rakeback</li>
                    </ul>
                    <p>
                        Rakeback is credited weekly on Mondays for the previous week's play.
                    </p>
                </section>

                <section>
                    <h2>6. Referral Bonuses</h2>
                    <p>
                        Refer friends to Club Arena and earn rewards:
                    </p>
                    <ul>
                        <li>Referrer receives 500 chips when friend completes registration</li>
                        <li>Referrer receives 1000 chips when friend plays their first hand</li>
                        <li>Referrer receives 5% of friend's rake for their first month</li>
                    </ul>
                    <p>
                        Self-referrals and fake accounts are prohibited and will result in account termination.
                    </p>
                </section>

                <section>
                    <h2>7. Club-Specific Promotions</h2>
                    <p>
                        Individual clubs may run their own promotions with custom rules:
                    </p>
                    <ul>
                        <li>Club owners set promotion terms and eligibility</li>
                        <li>Club promotions are funded by the club, not Club Arena</li>
                        <li>Disputes regarding club promotions should be directed to the club owner</li>
                    </ul>
                </section>

                <section>
                    <h2>8. Promotion Abuse</h2>
                    <p>
                        The following activities are considered promotion abuse and are strictly prohibited:
                    </p>
                    <ul>
                        <li>Creating multiple accounts to claim bonuses</li>
                        <li>Colluding with other players to manipulate promotions</li>
                        <li>Using automated tools or bots</li>
                        <li>Exploiting bugs or glitches to gain unfair advantages</li>
                    </ul>
                    <p>
                        Promotion abuse will result in forfeiture of bonuses and potential account termination.
                    </p>
                </section>

                <section>
                    <h2>9. Modification and Cancellation</h2>
                    <p>
                        Club Arena reserves the right to modify, suspend, or cancel any promotion at any time without prior notice.
                        In the event of cancellation, users will be notified and any earned rewards will be honored.
                    </p>
                </section>

                <section>
                    <h2>10. Disputes</h2>
                    <p>
                        All decisions regarding promotions are final and at the sole discretion of Club Arena.
                        For promotion-related questions or disputes, contact support@smarter.poker
                    </p>
                </section>

                <div className={styles.lastUpdated}>
                    Last Updated: January 29, 2026
                </div>
            </div>
        </div>
    );
}
