import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { act, cleanup } from '@testing-library/react'

import { toast } from 'sonner'

afterEach(() => {
  act(() => { toast.dismiss() })
  cleanup()
})
