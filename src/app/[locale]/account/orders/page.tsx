"use client";

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Loader2, Package, ChevronRight, Clock, CheckCircle2, XCircle } from 'lucide-react';

export default function OrdersPage() {
  const t = useTranslations('Account');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const q = query(collection(db, 'orders'), where('user_id', '==', user.uid));
          const snap = await getDocs(q);
          const userOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Sort client-side to avoid needing a composite index immediately
          userOrders.sort((a: any, b: any) => (b.created_at?.toMillis() || 0) - (a.created_at?.toMillis() || 0));
          setOrders(userOrders);
        } catch (error) {
          console.error("Error fetching orders:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
     switch(status) {
       case 'pending': return <Clock className="text-yellow-500 w-5 h-5" />;
       case 'completed': return <CheckCircle2 className="text-green-500 w-5 h-5" />;
       case 'cancelled': return <XCircle className="text-red-500 w-5 h-5" />;
       default: return <Package className="text-blue-500 w-5 h-5" />;
     }
  };

  const getStatusColor = (status: string) => {
     switch(status) {
       case 'pending': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
       case 'completed': return 'bg-green-50 text-green-700 border-green-200';
       case 'cancelled': return 'bg-red-50 text-red-700 border-red-200';
       default: return 'bg-blue-50 text-blue-700 border-blue-200';
     }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8 text-[var(--color-secondary)]">{t('orders')}</h1>
      
      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-border/50 text-center shadow-sm">
          <p className="text-gray-500 mb-6">{t('ordersEmpty', { fallback: "You haven't placed any orders yet." })}</p>
          <Link href="/products" className="inline-block bg-[var(--color-primary)] text-white px-8 py-3 rounded-xl font-bold hover:opacity-90 transition-opacity">
            {t('startShopping', { fallback: "Start Shopping" })}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.id} className="bg-white rounded-2xl p-6 border border-border/50 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <Package className="text-gray-400 w-6 h-6" />
                 </div>
                 <div>
                   <h3 className="font-bold text-lg font-mono">{order.order_number}</h3>
                   <p className="text-sm text-gray-500">
                     {order.created_at ? new Date(order.created_at.toDate()).toLocaleDateString() : 'N/A'}
                   </p>
                 </div>
               </div>
               
               <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-8">
                 <div className={`px-3 py-1 rounded-full border text-sm font-bold flex items-center gap-1.5 capitalize ${getStatusColor(order.status)}`}>
                   {getStatusIcon(order.status)}
                   {t(`status_${order.status}`, { fallback: order.status })}
                 </div>
                 
                 <div className="text-left md:text-right">
                   <p className="text-sm text-gray-500">{t('total', { fallback: 'Total' })}</p>
                   <p className="font-bold text-xl">{order.total} ₺</p>
                 </div>

                 <Link 
                   href={`/order-confirmation/${order.id}`}
                   className="mt-2 md:mt-0 flex items-center gap-1 text-[var(--color-primary)] font-bold hover:bg-[var(--color-primary)]/10 px-4 py-2 rounded-lg transition-colors"
                 >
                   {t('viewDetails', { fallback: 'View Details' })}
                   <ChevronRight className="rtl:rotate-180" size={18} />
                 </Link>
               </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
