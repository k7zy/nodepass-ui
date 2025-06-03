'use client';

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger
} from "@heroui/react";
import React from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisV, faPlus } from "@fortawesome/free-solid-svg-icons";

export const ProTableToolBox = () => {
  return (
    <div className="flex justify-between items-center px-4 py-3 w-full">
      <div className="text-lg font-semibold">Pro Table Header</div>
      <div className="flex gap-2">
        <Button 
          color="primary" 
          size="sm"
          startContent={<FontAwesomeIcon icon={faPlus} />}
        >
          Create
        </Button>
        <Dropdown>
          <DropdownTrigger>
            <Button 
              variant="bordered" 
              size="sm"
              isIconOnly
            >
              <FontAwesomeIcon icon={faEllipsisV} />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Static Actions">
            <DropdownItem key="new">New file</DropdownItem>
            <DropdownItem key="copy">Copy link</DropdownItem>
            <DropdownItem key="edit">Edit file</DropdownItem>
            <DropdownItem key="delete" color="danger">
              Delete file
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );
};
