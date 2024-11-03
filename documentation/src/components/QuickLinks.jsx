import Link from 'next/link'

import { Icon } from '@/components/Icon'

export function QuickLinks({ children }) {
  return (
    <div className="not-prose my-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
      {children}
    </div>
  )
}

export function QuickLink({ title, description, href, icon }) {
  return (
    <div className="group relative rounded-xl border border-neutral-200 dark:border-neutral-800 hover:bg-white/5 transition">
      <div className="absolute -inset-px rounded-xl border-2 border-transparent opacity-0" />
      <div className="relative overflow-hidden rounded-xl p-6">
        <Icon icon={icon} className="h-8 w-8 grayscale" />
        <h2 className="mt-4 font-display text-base text-neutral-900 dark:text-white">
          <Link href={href}>
            <span className="absolute -inset-px rounded-xl" />
            {title}
          </Link>
        </h2>
        <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-400">
          {description}
        </p>
      </div>
    </div>
  )
}
