import React, { useState } from 'react'
import { LuEye, LuEyeOff } from 'react-icons/lu'

// A password / PIN field with an eye button to show or hide what's typed
const SecretInput = ({ className = '', ...props }) => {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={`${className} px-12!`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
        aria-label={show ? 'Hide' : 'Show'}
        aria-pressed={show}
        title={show ? 'Hide' : 'Show'}
      >
        {show ? <LuEyeOff className="size-4" /> : <LuEye className="size-4" />}
      </button>
    </div>
  )
}

export default SecretInput
