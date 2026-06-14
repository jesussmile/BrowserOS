const LOCAL_ONLY_AUTH_RESULT = {
  data: null,
  error: {
    message: 'Cloud account login is disabled in this private PannamOS build.',
  },
} as const

const localOnlyAuthAction = async () => LOCAL_ONLY_AUTH_RESULT

export const signIn = localOnlyAuthAction
export const signUp = localOnlyAuthAction
export const signOut = async () => ({ data: null, error: null })

export const useSession = () => ({
  data: null,
  error: null,
  isPending: false,
})
