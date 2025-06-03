"use client";

import {
  Avatar,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/app/components/auth-provider";
import { useState } from "react";
import { addToast } from "@heroui/toast";

/**
 * 导航栏用户组件
 * 包含用户头像和下拉菜单
 */
export const NavbarUser = () => {
  const { user, logout } = useAuth();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  const handlePasswordChange = async () => {
    // 验证表单
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      addToast({
        title: "表单验证失败",
        description: "请填写所有密码字段",
        color: "danger",
      });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addToast({
        title: "密码不匹配",
        description: "新密码和确认密码不一致",
        color: "danger",
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      addToast({
        title: "密码太短",
        description: "新密码长度至少为6位",
        color: "danger",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addToast({
          title: "密码修改成功",
          description: "您的密码已成功更新",
          color: "success",
        });
        
        // 重置表单并关闭模态框
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        });
        onOpenChange();
      } else {
        addToast({
          title: "密码修改失败",
          description: result.message || "请检查您的当前密码是否正确",
          color: "danger",
        });
      }
    } catch (error) {
      console.error('修改密码失败:', error);
      addToast({
        title: "网络错误",
        description: "请检查网络连接后重试",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormChange = (field: string, value: string) => {
    setPasswordForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!user) {
    return null; // 未登录时不显示用户菜单
  }

  return (
    <>
      <Dropdown placement="bottom-end">
        <DropdownTrigger>
          <Avatar
            isBordered
            as="button"
            className="transition-transform"
            color="primary"
            name={user.username}
            size="sm"
            showFallback
          />
        </DropdownTrigger>
        <DropdownMenu 
          aria-label="用户菜单"
          variant="flat"
          className="w-[240px]"
          onAction={(key) => {
            if (key === 'logout') {
              handleLogout();
            } else if (key === 'change-password') {
              onOpen();
            }
          }}
        >
          {/* 用户信息 */}
          <DropdownItem key="profile" className="h-14 gap-2">
            <p className="font-semibold">已登录为</p>
            <p className="font-semibold">{user.username}</p>
          </DropdownItem>
          
          {/* 修改密码 */}
          <DropdownItem 
            key="change-password"
            startContent={<Icon icon="solar:key-linear" width={18} />}
          >
            修改密码
          </DropdownItem>
          
          {/* 帮助文档 */}
          {/* <DropdownItem 
            key="help"
            href="/docs"
            startContent={<Icon icon="solar:document-text-linear" width={18} />}
          >
            帮助文档
          </DropdownItem> */}
          
          {/* 退出登录 */}
          <DropdownItem 
            key="logout" 
            color="danger"
            startContent={<Icon icon="solar:logout-3-linear" width={18} />}
          >
            退出登录
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      {/* 修改密码模态框 */}
      <Modal 
        isOpen={isOpen} 
        onOpenChange={onOpenChange}
        placement="center"
        backdrop="blur"
        classNames={{
          backdrop: "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon icon="solar:key-bold" className="text-primary" width={24} />
                  修改密码
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <Input
                    label="当前密码"
                    placeholder="请输入当前密码"
                    type="password"
                    variant="bordered"
                    value={passwordForm.currentPassword}
                    onChange={(e) => handleFormChange('currentPassword', e.target.value)}
                    startContent={<Icon icon="solar:lock-password-linear" width={18} />}
                  />
                  
                  <Input
                    label="新密码"
                    placeholder="请输入新密码"
                    type="password"
                    variant="bordered"
                    value={passwordForm.newPassword}
                    onChange={(e) => handleFormChange('newPassword', e.target.value)}
                    startContent={<Icon icon="solar:key-linear" width={18} />}
                  />
                  
                  <Input
                    label="确认新密码"
                    placeholder="请再次输入新密码"
                    type="password"
                    variant="bordered"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handleFormChange('confirmPassword', e.target.value)}
                    startContent={<Icon icon="solar:key-linear" width={18} />}
                  />
                  
                  <div className="text-small text-default-500">
                    <p>• 密码长度至少为6位</p>
                    <p>• 建议包含字母、数字和特殊字符</p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button 
                  color="danger" 
                  variant="light" 
                  onPress={onClose}
                  isDisabled={isSubmitting}
                >
                  取消
                </Button>
                <Button 
                  color="primary" 
                  onPress={handlePasswordChange}
                  isLoading={isSubmitting}
                  startContent={!isSubmitting ? <Icon icon="solar:check-circle-linear" width={18} /> : null}
                >
                  {isSubmitting ? "修改中..." : "确认修改"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}; 