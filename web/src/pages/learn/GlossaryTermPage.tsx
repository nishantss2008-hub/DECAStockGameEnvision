/**
 * Glossary term (MOBILE §7.14): Back "Learn" · Title 1 label · Subhead term · What it is / Why it matters /
 * Usually a good sign when… (COPY §2) · "See it on a company" · "Related terms" chips.
 */
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LargeTitleNavBar } from '../../components/ios/LargeTitleNavBar';
import { EmptyState } from '../../components/ios/EmptyState';
import { INFO_TIP_COPY, glossaryTermPath } from '../../components/ios/InfoTipSheet';
import { GLOSSARY } from '../../lib/glossary';
import { useDocumentTitle, useStackBack } from '../../shell/StubPage';
import { LEARN_MOBILE, LEARN_PATHS, relatedEntries } from '../../components/learn/learnLogic';
import { SeeItOnCompany } from '../../components/learn/SeeItOnCompany';
import { useCurrencyText } from '../../components/learn/useCurrencyText';
import '../../components/learn/learn.css';

export default function GlossaryTermPage() {
  const { termId = '' } = useParams();
  const entry = GLOSSARY[termId] ?? null;
  const back = useStackBack(LEARN_PATHS.root);
  const navigate = useNavigate();
  const cur = useCurrencyText();
  useDocumentTitle(entry ? entry.label : LEARN_MOBILE.glossary);

  if (!entry) {
    return (
      <>
        <LargeTitleNavBar title={LEARN_MOBILE.glossary} back={back} />
        <div className="bx-page bx-learn">
          <EmptyState title={LEARN_MOBILE.termNotFound} action={{ label: LEARN_MOBILE.backToLearn, onClick: () => navigate(LEARN_PATHS.root, { replace: true }) }} />
        </div>
      </>
    );
  }

  const related = relatedEntries(entry);
  const block = (heading: string, body: ReactNode) => (
    <div className="ios-infotip-lines__block">
      <h2 className="ios-infotip-lines__heading">{heading}</h2>
      <p className="ios-infotip-lines__body">{body}</p>
    </div>
  );

  return (
    <>
      <LargeTitleNavBar title={entry.label} back={back} className="bx-learn-term-nav" />
      <div className="bx-page bx-learn bx-learn-term" key={entry.id}>
        <p className="bx-learn-term__term">{entry.term}</p>
        <div className="ios-infotip-lines bx-learn-term__lines">
          {block(INFO_TIP_COPY.whatItIs, cur(entry.whatItIs))}
          {block(INFO_TIP_COPY.whyItMatters, cur(entry.whyItMatters))}
          {block(
            INFO_TIP_COPY.usuallyGood,
            <>
              <span aria-hidden="true">…</span>
              {cur(entry.usuallyGoodWhen)}
            </>,
          )}
        </div>
        <SeeItOnCompany termId={entry.id} />
        {related.length > 0 && (
          <section className="bx-learn-related" aria-labelledby="bx-learn-related-title">
            <div className="ios-list__header" data-variant="prominent">
              <h2 id="bx-learn-related-title" className="ios-list__title">
                {LEARN_MOBILE.relatedTerms}
              </h2>
            </div>
            <ul className="bx-learn-chips">
              {related.map((r) => (
                <li key={r.id}>
                  <Link className="bx-learn-chip" to={glossaryTermPath(r.id)}>
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
