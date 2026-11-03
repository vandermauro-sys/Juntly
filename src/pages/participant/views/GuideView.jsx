import { t } from '../../../lib/i18n'

export default function GuideView({ trip, lang }) {
  if (!trip.guide) return <div className="card empty">{t(lang, 'guide_empty')}</div>
  return <div className="card guide">{trip.guide}</div>
}
