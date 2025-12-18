// src/features/auth/sign-up/components/enhanced-sign-up-form.tsx
import { HTMLAttributes, useState, useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { IconBrandFacebook, IconBrandGithub, IconCheck, IconX, IconLoader } from '@tabler/icons-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { supabase } from '@/lib/supabase'

type SignUpFormProps = HTMLAttributes<HTMLFormElement>

const formSchema = z
  .object({
    username: z
      .string()
      .min(3, { message: 'Username must be at least 3 characters' })
      .max(30, { message: 'Username cannot exceed 30 characters' })
      .regex(/^[a-zA-Z0-9_-]+$/, { 
        message: 'Username can only contain letters, numbers, underscores, and hyphens' 
      })
      .transform(val => val.toLowerCase()),
    email: z
      .string()
      .min(1, { message: 'Please enter your email' })
      .email({ message: 'Invalid email address' }),
    password: z
      .string()
      .min(1, { message: 'Please enter your password' })
      .min(8, { message: 'Password must be at least 8 characters long' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ['confirmPassword'],
  })

// Username availability checking
async function checkUsernameAvailability(username: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username.toLowerCase())
      .maybeSingle();

    if (error) {
      console.error('Error checking username:', error);
      return false;
    }

    return !data; // Available if no existing user found
  } catch (error) {
    console.error('Error checking username availability:', error);
    return false;
  }
}

export function SignUpForm({ className, ...props }: SignUpFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string;
  }>({
    checking: false,
    available: null,
    message: ''
  });

  const { signUp } = useAuth()
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  const watchedUsername = form.watch('username');

  // Debounced username availability check
  useEffect(() => {
    if (!watchedUsername || watchedUsername.length < 3) {
      setUsernameStatus({ checking: false, available: null, message: '' });
      return;
    }

    const timeoutId = setTimeout(async () => {
      setUsernameStatus({ checking: true, available: null, message: 'Checking availability...' });
      
      try {
        const isAvailable = await checkUsernameAvailability(watchedUsername);
        setUsernameStatus({
          checking: false,
          available: isAvailable,
          message: isAvailable ? 'Username is available!' : 'Username is already taken'
        });
      } catch (error) {
        setUsernameStatus({
          checking: false,
          available: false,
          message: 'Error checking username'
        });
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [watchedUsername]);

  async function onSubmit(data: z.infer<typeof formSchema>) {
    // Final username availability check
    if (!usernameStatus.available) {
      toast.error('Please choose an available username');
      return;
    }

    setIsLoading(true);
    
    try {
      // Sign up with custom metadata including username
      const { error } = await signUp(data.email, data.password, {
        data: {
          username: data.username,
          display_name: data.username, // Use username as initial display name
        }
      });
      
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Check your email to confirm your account!');
        navigate({ to: '/otp', search: { email: data.email } });
      }
    } catch {
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  const getUsernameIcon = () => {
    if (usernameStatus.checking) {
      return <IconLoader className="animate-spin" size={16} />;
    }
    if (usernameStatus.available === true) {
      return <IconCheck className="text-green-600" size={16} />;
    }
    if (usernameStatus.available === false) {
      return <IconX className="text-red-600" size={16} />;
    }
    return null;
  };

  const getUsernameInputClass = () => {
    if (usernameStatus.available === true) return 'border-green-300 focus:border-green-500';
    if (usernameStatus.available === false) return 'border-red-300 focus:border-red-500';
    return '';
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='username'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input 
                    placeholder='johndoe' 
                    {...field} 
                    className={cn(getUsernameInputClass(), 'pr-8')}
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                    {getUsernameIcon()}
                  </div>
                </div>
              </FormControl>
              {usernameStatus.message && (
                <p className={cn(
                  "text-sm",
                  usernameStatus.available === true && "text-green-600",
                  usernameStatus.available === false && "text-red-600",
                  usernameStatus.checking && "text-gray-500"
                )}>
                  {usernameStatus.message}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder='name@example.com' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='confirmPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button 
          className='mt-2' 
          disabled={isLoading || !usernameStatus.available || usernameStatus.checking}
        >
          {isLoading ? 'Creating Account...' : 'Create Account'}
        </Button>

        <div className='relative my-2'>
          <div className='absolute inset-0 flex items-center'>
            <span className='w-full border-t' />
          </div>
          <div className='relative flex justify-center text-xs uppercase'>
            <span className='bg-background text-muted-foreground px-2'>
              Or continue with
            </span>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <Button
            variant='outline'
            className='w-full'
            type='button'
            disabled={isLoading}
          >
            <IconBrandGithub className='h-4 w-4' /> GitHub
          </Button>
          <Button
            variant='outline'
            className='w-full'
            type='button'
            disabled={isLoading}
          >
            <IconBrandFacebook className='h-4 w-4' /> Facebook
          </Button>
        </div>
      </form>
    </Form>
  )
}