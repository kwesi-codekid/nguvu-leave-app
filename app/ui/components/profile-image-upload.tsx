import { useState, useRef } from "react"
import { Avatar, Button, Card, CardBody } from "@heroui/react"
import { Camera, Upload, X, User } from "lucide-react"

interface ProfileImageUploadProps {
    value?: any
    onChange: (image: any | null) => void
    name?: string
    className?: string
}

export function ProfileImageUpload({ value, onChange, name, className = "" }: ProfileImageUploadProps) {
    const [isDragging, setIsDragging] = useState(false)
    const [isHovered, setIsHovered] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileSelect = (file: File) => {
        if (file && file.type.startsWith('image/')) {
            const imageData = {
                url: URL.createObjectURL(file),
                publicId: file.name,
                filename: file.name,
                fileType: file.type,
                uploadedAt: new Date(),
            }
            onChange(imageData)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        
        const files = e.dataTransfer.files
        if (files.length > 0) {
            handleFileSelect(files[0])
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = () => {
        setIsDragging(false)
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            handleFileSelect(file)
        }
    }

    const handleRemove = () => {
        onChange(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleClick = () => {
        if (!value) {
            fileInputRef.current?.click()
        }
    }

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <div
                className={`relative group cursor-pointer transition-all duration-300 overflow-hidden rounded-lg ${
                    isDragging ? 'scale-[1.02]' : ''
                }`}
                onClick={handleClick}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <Card 
                    className={`border-2 transition-all duration-300 overflow-hidden ${
                        isDragging 
                            ? 'border-primary bg-primary/5 scale-[1.02]' 
                            : isHovered 
                                ? 'border-primary/50 bg-primary/5' 
                                : 'border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50'
                    }`}
                >
                    <CardBody className="p-0">
                        {value ? (
                            <div className="relative w-full h-32">
                                <img
                                    src={value.url}
                                    alt="Profile preview"
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                                    <div className="flex gap-2">
                                        <div 
                                            className="bg-white/90 text-black rounded-full p-2"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                fileInputRef.current?.click()
                                            }}
                                        >
                                            <Camera className="size-4" />
                                        </div>
                                        <div 
                                            className="bg-white/90 text-black rounded-full p-2"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleRemove()
                                            }}
                                        >
                                            <X className="size-4" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-6 h-32">
                                <div className={`rounded-full p-3 transition-all duration-300 ${
                                    isDragging || isHovered 
                                        ? 'bg-primary/20 text-primary' 
                                        : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                                }`}>
                                    {isDragging ? (
                                        <Upload className="size-6 animate-bounce" />
                                    ) : (
                                        <Camera className="size-6" />
                                    )}
                                </div>
                                <div className="text-center mt-2">
                                    <p className={`text-sm font-medium transition-colors duration-300 ${
                                        isDragging || isHovered 
                                            ? 'text-primary' 
                                            : 'text-zinc-700 dark:text-zinc-300'
                                    }`}>
                                        {isDragging ? 'Drop image here' : 'Upload photo'}
                                    </p>
                                    <p className="text-xs text-zinc-500">
                                        Click or drag & drop
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardBody>
                </Card>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleInputChange}
                className="hidden"
            />

            {value && (
                <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-500 truncate flex-1">
                        {value.filename}
                    </div>
                    <Button
                        size="sm"
                        variant="flat"
                        color="danger"
                        startContent={<X className="size-3" />}
                        onClick={handleRemove}
                        className="text-xs ml-2"
                    >
                        Remove
                    </Button>
                </div>
            )}

            <div className="text-xs text-zinc-400 text-center">
                JPG, PNG, GIF, WebP (Max 5MB)
            </div>
        </div>
    )
}
