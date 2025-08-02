import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface Platform {
  id: string;
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'pending';
  features: string[];
  logo: string;
}

interface AddPlatformModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPlatform: (platform: Platform) => void;
}

export const AddPlatformModal = ({ isOpen, onClose, onAddPlatform }: AddPlatformModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    logo: '',
    features: [] as string[]
  });
  const [currentFeature, setCurrentFeature] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) return;

    const newPlatform: Platform = {
      id: formData.name.toLowerCase().replace(/\s+/g, '-'),
      name: formData.name,
      description: formData.description,
      status: 'disconnected',
      features: formData.features,
      logo: formData.logo || '🔷'
    };

    onAddPlatform(newPlatform);
    handleClose();
  };

  const handleClose = () => {
    setFormData({
      name: '',
      description: '',
      logo: '',
      features: []
    });
    setCurrentFeature('');
    onClose();
  };

  const addFeature = () => {
    if (currentFeature.trim() && !formData.features.includes(currentFeature.trim())) {
      setFormData(prev => ({
        ...prev,
        features: [...prev.features, currentFeature.trim()]
      }));
      setCurrentFeature('');
    }
  };

  const removeFeature = (feature: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.filter(f => f !== feature)
    }));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFeature();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Trading Platform</DialogTitle>
          <DialogDescription>
            Enter the details for the new trading platform you want to add.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Platform Name *</Label>
            <Input
              id="name"
              placeholder="e.g., OKX, Bitfinex, FTX"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Brief description of the platform"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">Logo (Emoji)</Label>
            <Input
              id="logo"
              placeholder="🔷"
              value={formData.logo}
              onChange={(e) => setFormData(prev => ({ ...prev, logo: e.target.value }))}
              maxLength={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="features">Features</Label>
            <div className="flex gap-2">
              <Input
                id="features"
                placeholder="e.g., Spot Trading, Futures"
                value={currentFeature}
                onChange={(e) => setCurrentFeature(e.target.value)}
                onKeyPress={handleKeyPress}
              />
              <Button type="button" onClick={addFeature} variant="outline">
                Add
              </Button>
            </div>
            
            {formData.features.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.features.map((feature) => (
                  <Badge key={feature} variant="outline" className="flex items-center gap-1">
                    {feature}
                    <X 
                      className="w-3 h-3 cursor-pointer hover:text-destructive" 
                      onClick={() => removeFeature(feature)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="trading">
              Add Platform
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};