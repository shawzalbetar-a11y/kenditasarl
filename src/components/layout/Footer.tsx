import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Instagram, MessageCircle, Twitter } from 'lucide-react';

export default function Footer() {
  const t = useTranslations('Footer');

  return (
    <footer className="bg-secondary text-white pt-12 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="mb-4 inline-block">
              <img src="/images/logo.png" alt="Kenditasarl Logo" className="h-10 w-auto object-contain" />
            </Link>
            <p className="text-gray-300 text-sm mb-6">
              Platformumuzda kendi tasarımınızı oluşturun veya hazır ürünlerimizden sipariş verin.
            </p>
            <div className="flex space-x-4 rtl:space-x-reverse">
              <a href="#" className="text-gray-400 hover:text-primary transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-primary transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-primary transition-colors">
                <MessageCircle className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">Mağaza</h3>
            <ul className="space-y-2">
              <li><Link href="/tshirts" className="text-gray-300 hover:text-primary transition-colors text-sm">Tişörtler</Link></li>
              <li><Link href="/hats" className="text-gray-300 hover:text-primary transition-colors text-sm">Şapkalar</Link></li>
              <li><Link href="/mugs" className="text-gray-300 hover:text-primary transition-colors text-sm">Kupalar</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">Kurumsal</h3>
            <ul className="space-y-2">
              <li><Link href="/about" className="text-gray-300 hover:text-primary transition-colors text-sm">{t('about')}</Link></li>
              <li><Link href="/contact" className="text-gray-300 hover:text-primary transition-colors text-sm">{t('contact')}</Link></li>
              <li><Link href="/privacy" className="text-gray-300 hover:text-primary transition-colors text-sm">{t('privacy')}</Link></li>
              <li><Link href="/terms" className="text-gray-300 hover:text-primary transition-colors text-sm">{t('terms')}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-white">Bülten</h3>
            <p className="text-gray-300 text-sm mb-4">Yeni ürünler ve kampanyalardan haberdar olmak için e-bültene kayıt olun.</p>
            <form className="flex gap-2">
              <input 
                type="email" 
                placeholder="E-posta adresiniz" 
                className="bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-md text-sm w-full focus:outline-none focus:border-primary"
              />
              <button className="bg-primary hover:bg-opacity-90 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
                Kayıt
              </button>
            </form>
          </div>
          
        </div>
        
        <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">© {new Date().getFullYear()} Kenditasarl. {t('rights')}</p>
        </div>
      </div>
    </footer>
  );
}
