from django.contrib import admin
from .models import Category, Product, StockMovement, Supplier


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    search_fields = ['name']
    list_display = ['name', 'created_at']


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    search_fields = ['name', 'email']
    list_display = ['name', 'contact_name', 'email', 'lead_time_days']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    search_fields = ['name', 'sku']
    list_filter = ['category']
    list_display = ['sku', 'name', 'category', 'quantity', 'reorder_level', 'unit_price']


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    search_fields = ['product__name', 'product__sku', 'reference']
    list_filter = ['movement_type', 'created_at']
    list_display = ['product', 'movement_type', 'quantity', 'reference', 'created_at']
