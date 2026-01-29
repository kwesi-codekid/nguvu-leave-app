/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalProps,
} from "@heroui/react";
import { ReactNode } from "react";

interface Props extends ModalProps {
  footer?: ReactNode;
  title?: string;
}

export const ConfirmModal = (props: Props) => {
  return (
    <Modal scrollBehavior="inside" backdrop="blur" {...props}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1 text-base">
              {props.title}
            </ModalHeader>
            <ModalBody>{props.children}</ModalBody>
            <ModalFooter>{props.footer}</ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export const FormModal = (props: Props) => {
  return (
    <Modal scrollBehavior="inside" backdrop="blur" {...props}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1 text-base">
              {props.title}
            </ModalHeader>
            <ModalBody>{props.children}</ModalBody>
            {props.footer && <ModalFooter>{props.footer}</ModalFooter>}
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
