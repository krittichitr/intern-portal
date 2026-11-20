import { useContext } from 'react'
import { MenuContext } from './menu-context'
export function useMenus() {
  const value = useContext(MenuContext)
  if (!value) throw new Error('useMenus must be used within MenuProvider')
  return value
}
