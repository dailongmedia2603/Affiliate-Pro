import { toast } from "sonner";

export const showSuccess = (message: string, id?: string | number) => {
  toast.success(message, { id });
};

export const showError = (message: string, id?: string | number) => {
  toast.error(message, { id });
};

export const showLoading = (message: string) => {
  return toast.loading(message);
};

export const updateLoading = (toastId: string | number, message: string) => {
  toast.loading(message, { id: toastId });
};

export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};